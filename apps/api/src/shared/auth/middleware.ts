import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HttpError } from "../http/errors.js";
import { readSessionToken } from "./cookies.js";
import { resolveSession, type AuthContext } from "./session.service.js";

export type AuthVariables = {
  auth: AuthContext;
};

async function authenticate(c: Context): Promise<AuthContext> {
  const session = await resolveSession(readSessionToken(c));
  if (!session) {
    throw new HttpError(401, "UNAUTHENTICATED", "Authentication required");
  }
  if (!session.user.isActive) {
    throw new HttpError(403, "ACCOUNT_INACTIVE", "Account is inactive");
  }
  return session;
}

export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  c.set("auth", await authenticate(c));
  await next();
});

export const requireAdmin = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const auth = await authenticate(c);
  if (auth.user.role !== "admin") {
    throw new HttpError(403, "FORBIDDEN", "Admin access required");
  }
  c.set("auth", auth);
  await next();
});
