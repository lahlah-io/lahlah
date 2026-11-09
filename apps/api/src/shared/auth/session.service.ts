import { env } from "../../env.js";
import type { Role } from "../../generated/prisma/enums.js";
import { hashToken, randomToken } from "./tokens.js";
import * as sessionRepository from "./session.repository.js";
import type { AuthUserRecord } from "./session.repository.js";

export type AuthUser = AuthUserRecord;

export type AuthContext = {
  sessionId: string;
  user: AuthUser;
};

export type SessionMeta = {
  userAgent?: string | null;
  ip?: string | null;
};

/**
 * The first admin bootstraps through ADMIN_EMAILS. Roles are only ever upgraded
 * automatically; removing an email from the list never demotes an existing admin.
 */
export function resolveRoleForEmail(email: string | null | undefined, currentRole: Role): Role {
  if (currentRole === "admin") return "admin";
  if (email && env.ADMIN_EMAILS.includes(email.toLowerCase())) return "admin";
  return currentRole;
}

export async function createSession(
  userId: string,
  meta: SessionMeta = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await sessionRepository.createSessionRecord({
    userId,
    tokenHash: hashToken(token, env.SESSION_TOKEN_PEPPER),
    expiresAt,
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
  });

  return { token, expiresAt };
}

export async function resolveSession(token: string | undefined): Promise<AuthContext | null> {
  if (!token) return null;

  const session = await sessionRepository.findSessionByTokenHash(
    hashToken(token, env.SESSION_TOKEN_PEPPER),
  );
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;

  return { sessionId: session.id, user: session.user };
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await sessionRepository.revokeSessionByTokenHash(hashToken(token, env.SESSION_TOKEN_PEPPER));
}
