import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { env } from "../../env.js";

export const SESSION_COOKIE_NAME = "lahlah_session";

/**
 * Accepts `Authorization: Bearer <token>` for server-to-server and tests, and
 * falls back to the browser session cookie.
 */
export function readSessionToken(c: Context): string | undefined {
  const header = c.req.header("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice("bearer ".length).trim();
    if (token) return token;
  }
  return getCookie(c, SESSION_COOKIE_NAME);
}

export function setSessionCookie(c: Context, token: string, expiresAt: Date): void {
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: env.NODE_ENV === "production",
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
}
