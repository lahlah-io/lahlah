import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.json({ name: "lahlah-api" }));
app.get("/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`API ready at http://localhost:${port}`);
});
