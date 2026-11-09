import { Hono } from "hono";
import type { Context } from "hono";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "../../../shared/auth/cookies.js";
import { requireAuth, type AuthVariables } from "../../../shared/auth/middleware.js";
import { zValidator } from "../../../shared/http/validator.js";
import { exchangePidCodeSchema } from "../schemas/auth.schema.js";
import { loginWithPidCode, logout } from "../services/auth.service.js";

const authApi = new Hono<{ Variables: AuthVariables }>();

function clientIp(c: Context): string | null {
  const forwarded = c.req.header("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || null;
}

authApi.post("/peridot/exchange", zValidator("json", exchangePidCodeSchema), async (c) => {
  const result = await loginWithPidCode(c.req.valid("json"), {
    userAgent: c.req.header("user-agent") ?? null,
    ip: clientIp(c),
  });

  setSessionCookie(c, result.token, result.expiresAt);

  const wantsBearer = c.req.header("x-session-mode")?.toLowerCase() === "bearer";
  return c.json(
    {
      data: {
        user: result.user,
        ...(wantsBearer ? { token: result.token, expiresAt: result.expiresAt } : {}),
      },
    },
    200,
  );
});

authApi.get("/me", requireAuth, (c) => c.json({ data: c.get("auth").user }));

authApi.post("/logout", async (c) => {
  await logout(readSessionToken(c));
  clearSessionCookie(c);
  return c.json({ data: { ok: true } });
});

export { authApi };
