import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authRoutes } from "./auth/routes.js";
import { env } from "./env.js";

export const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [env.appOrigin, env.adminOrigin],
    credentials: true,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["content-type"],
  }),
);

app.get("/", (c) => c.json({ name: "lahlah-api" }));
app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/auth", authRoutes);

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "internal_error" }, 500);
});
