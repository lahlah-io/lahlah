import { Hono } from "hono";
import type { Context } from "hono";
import { prisma } from "../db/client.js";
import { PeridotError, exchangePidCode, primaryEmail } from "./peridot.js";
import {
  clearSessionCookie,
  createSession,
  findSessionUser,
  readSessionToken,
  revokeSession,
  setSessionCookie,
  toSessionUser,
} from "./session.js";

export const authRoutes = new Hono();

type ExchangeBody = {
  code?: unknown;
  codeVerifier?: unknown;
};

function clientIp(c: Context): string | undefined {
  const forwarded = c.req.header("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || undefined;
}

/**
 * Spends a one-time `pid_code` issued by the PeridotID login popup, then creates
 * the app's own session. The browser never receives a PeridotID token.
 */
authRoutes.post("/peridot/exchange", async (c) => {
  let body: ExchangeBody;
  try {
    body = (await c.req.json()) as ExchangeBody;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  if (typeof body.code !== "string" || body.code.length === 0) {
    return c.json({ error: "code_required" }, 400);
  }

  try {
    const identity = await exchangePidCode(
      body.code,
      typeof body.codeVerifier === "string" ? body.codeVerifier : undefined,
    );

    const profile = {
      displayName: identity.profile?.displayName ?? null,
      avatarUrl: identity.profile?.avatarUrl ?? null,
      email: primaryEmail(identity),
      lastLoginAt: new Date(),
    };

    const user = await prisma.user.upsert({
      where: { pid: identity.pid },
      create: { pid: identity.pid, ...profile },
      update: profile,
    });

    const { token, expiresAt } = await createSession(user.id, {
      userAgent: c.req.header("user-agent"),
      ip: clientIp(c),
    });
    setSessionCookie(c, token, expiresAt);

    return c.json({ user: toSessionUser(user) });
  } catch (error) {
    if (error instanceof PeridotError) {
      return c.json({ error: "peridot_exchange_failed", message: error.message }, error.status);
    }
    throw error;
  }
});

authRoutes.get("/me", async (c) => {
  const user = await findSessionUser(readSessionToken(c));
  if (!user) {
    return c.json({ error: "unauthenticated" }, 401);
  }
  return c.json({ user });
});

authRoutes.post("/logout", async (c) => {
  await revokeSession(readSessionToken(c));
  clearSessionCookie(c);
  return c.json({ ok: true });
});
