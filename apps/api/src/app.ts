import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requestId, type RequestIdVariables } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { Hono } from "hono";
import { env } from "./env.js";
import { prisma } from "./db/client.js";
import { errorHandler } from "./shared/http/errors.js";
import { routes } from "./routes.js";

const app = new Hono<{ Variables: RequestIdVariables }>();
app.use("*", requestId());
app.use("*", logger((message) => console.log(JSON.stringify({ level: "info", message: message.replace(/\u001b\[[0-9;]*m/g, "") }))));
app.use("*", secureHeaders());
app.use("/api/*", bodyLimit({
  maxSize: 1024 * 1024,
  onError: (c) => c.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds 1 MiB" } }, 413),
}));
app.use("*", cors({
  origin: env.CORS_ORIGINS,
  credentials: true,
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Request-Id", "X-Session-Mode"],
}));
app.onError(errorHandler);
app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404));

app.get("/", (c) => c.json({ name: "lahlah-api" }));
app.get("/health", (c) => c.json({ status: "ok", requestId: c.get("requestId") }));
app.get("/health/live", (c) => c.json({ status: "ok", requestId: c.get("requestId") }));
app.get("/health/ready", async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ status: "ok", dependencies: { database: "ok" }, requestId: c.get("requestId") });
  } catch {
    return c.json({ status: "not_ready", dependencies: { database: "unavailable" }, requestId: c.get("requestId") }, 503);
  }
});
app.route("/", routes);

export { app };
