import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { prisma } from "../db/client.js";
import { env } from "../env.js";
import { hashToken, randomToken } from "./tokens.js";

const COOKIE_NAME = "lahlah_session";

export type SessionUser = {
  id: string;
  pid: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
};

export function toSessionUser(user: SessionUser): SessionUser {
  return {
    id: user.id,
    pid: user.pid,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    email: user.email,
  };
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + env.sessionTtlDays * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token, env.sessionTokenPepper),
      userAgent: meta.userAgent,
      ip: meta.ip,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function findSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token, env.sessionTokenPepper) },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  return toSessionUser(session.user);
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) {
    return;
  }

  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token, env.sessionTokenPepper), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function setSessionCookie(c: Context, token: string, expiresAt: Date): void {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: env.isProduction,
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
}

export function readSessionToken(c: Context): string | undefined {
  return getCookie(c, COOKIE_NAME);
}
