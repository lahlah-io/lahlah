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
      email,
      role: resolveRoleForEmail(email, "user"),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
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
    identity = await exchangePidCode(input.code, { codeVerifier: input.codeVerifier });
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
