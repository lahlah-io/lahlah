import { randomUUID } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client.js";
import type { Role } from "../../../generated/prisma/enums.js";
import {
  PeridotError,
  displayName,
  exchangePidCode,
  primaryEmail,
  type PeridotIdentity,
} from "../../../integrations/peridot/client.js";
import { recordActivity } from "../../../shared/audit/activity-log.js";
import { ensureFreeSubscription } from "../../../shared/billing/subscription.service.js";
import {
  createSession,
  resolveRoleForEmail,
  revokeSession,
  type SessionMeta,
} from "../../../shared/auth/session.service.js";
import { HttpError } from "../../../shared/http/errors.js";
import * as authRepository from "../repositories/auth.repository.js";
import type { AuthUserRecord } from "../repositories/auth.repository.js";
import type { ExchangePidCodeInput } from "../schemas/auth.schema.js";

export type LoginResult = {
  user: AuthUserRecord;
  token: string;
  expiresAt: Date;
};

function fallbackName(email: string | null, pid: string): string {
  const localPart = email?.split("@")[0]?.trim();
  return (localPart || `pengguna-${pid.slice(0, 8)}`).slice(0, 255);
}

/**
 * PeridotID tidak mengenalkan username, jadi backend menurunkannya dari
 * email atau nama tampilan. Basis dislugifikasi ke `[a-z0-9_]` lalu diberi
 * sufiks acak bila sudah dipakai; constraint unik DB tetap penjaga akhir.
 */
function usernameBase(email: string | null, profileName: string | null, pid: string): string {
  const candidates = [
    email?.split("@")[0] ?? "",
    profileName ?? "",
    `pengguna_${pid.slice(0, 8)}`,
  ];
  for (const raw of candidates) {
    const slug = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24);
    const padded = slug.length >= 3 ? slug : `user_${slug}`;
    if (/^[a-z0-9_]{3,30}$/.test(padded)) return padded;
  }
  return `user_${pid.slice(0, 8).toLowerCase()}`;
}

async function uniqueUsername(
  email: string | null,
  profileName: string | null,
  pid: string,
): Promise<string> {
  const base = usernameBase(email, profileName, pid);
  if (!(await authRepository.findUserByUsername(base))) return base;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${base}_${randomUUID().slice(0, 4)}`.slice(0, 30);
    if (!(await authRepository.findUserByUsername(candidate))) return candidate;
  }
  return `user_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

async function upsertUserFromIdentity(identity: PeridotIdentity): Promise<AuthUserRecord> {
  const email = primaryEmail(identity);
  const profileName = displayName(identity);
  const existing =
    (await authRepository.findUserByPid(identity.pid)) ??
    (email ? await authRepository.findUserByEmail(email) : null);

  if (existing) {
    const nextRole: Role = resolveRoleForEmail(email ?? existing.email, existing.role);
    try {
      return await authRepository.updateIdentity(existing.id, {
        pid: identity.pid,
        name: profileName ?? existing.name,
        email: email ?? existing.email,
        role: nextRole,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const linked = await authRepository.findUserByPid(identity.pid);
        if (linked) return linked;
      }
      throw error;
    }
  }

  try {
    return await authRepository.insertUser({
      pid: identity.pid,
      name: profileName ?? fallbackName(email, identity.pid),
      username: await uniqueUsername(email, profileName, identity.pid),
      email,
      role: resolveRoleForEmail(email, "user"),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const target = (error as Prisma.PrismaClientKnownRequestError).meta as
        | { target?: string[] }
        | undefined;
      // Balapan username: coba sekali lagi dengan sufiks acak baru.
      if (target?.target?.includes("username")) {
        return authRepository.insertUser({
          pid: identity.pid,
          name: profileName ?? fallbackName(email, identity.pid),
          username: `user_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
          email,
          role: resolveRoleForEmail(email, "user"),
        });
      }
      const linked = await authRepository.findUserByPid(identity.pid);
      if (linked) return linked;
      if (email) {
        const byEmail = await authRepository.findUserByEmail(email);
        if (byEmail) return byEmail;
      }
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function loginWithPidCode(
  input: ExchangePidCodeInput,
  meta: SessionMeta = {},
): Promise<LoginResult> {
  let identity: PeridotIdentity;
  try {
    identity = await exchangePidCode(input.code, {
      codeVerifier: input.codeVerifier,
      redirectUri: input.redirectUri,
    });
  } catch (error) {
    if (error instanceof PeridotError) {
      throw new HttpError(error.status, "PERIDOT_EXCHANGE_FAILED", error.message);
    }
    throw error;
  }

  const user = await upsertUserFromIdentity(identity);
  if (!user.isActive) {
    throw new HttpError(403, "ACCOUNT_INACTIVE", "Account is inactive");
  }

  await ensureFreeSubscription(user.id);
  const session = await createSession(user.id, meta);

  await recordActivity({
    actorId: user.id,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
    metadata: { role: user.role },
  });

  return { user, token: session.token, expiresAt: session.expiresAt };
}

export async function logout(token: string | undefined): Promise<void> {
  await revokeSession(token);
}
