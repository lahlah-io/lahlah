import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requestId, type RequestIdVariables } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { Hono } from "hono";
import { env } from "./env.js";
import { prisma } from "./db/client.js";
import { openApiDocument, swaggerUiHtml } from "./openapi/index.js";
import { errorHandler } from "./shared/http/errors.js";
import { routes } from "./routes.js";

const app = new Hono<{ Variables: RequestIdVariables }>();
app.use("*", requestId());
app.use("*", logger((message) => console.log(JSON.stringify({ level: "info", message: message.replace(/\u001b\[[0-9;]*m/g, "") })))); // eslint-disable-line no-control-regex -- sengaja menghapus kode warna ANSI
app.use("*", secureHeaders());
app.use("/api/*", bodyLimit({
  maxSize: 1024 * 1024,
  onError: (c) => c.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds 1 MiB" } }, 413),
}));
function isLocalDevOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    const h = u.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || /^192\.168\./.test(h) || /^10\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  } catch {
    return false;
  }
}

app.use("*", cors({
  origin(origin) {
    if (!origin) return undefined;
    if (env.CORS_ORIGINS.includes(origin)) return origin;
    if (env.NODE_ENV !== "production" && isLocalDevOrigin(origin)) return origin;
    return undefined;
  },
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
app.get("/openapi.json", (c) => c.json(openApiDocument));
app.get("/docs", (c) => c.html(swaggerUiHtml));
app.route("/", routes);

export { app };
