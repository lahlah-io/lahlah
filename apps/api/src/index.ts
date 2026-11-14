import { networkInterfaces } from "node:os";
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { env } from "./env.js";
import { prisma } from "./db/client.js";

function localUrls(port: number, host: string): string[] {
  if (host !== "0.0.0.0" && host !== "::") return [`http://${host}:${port}`];
  const urls = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      urls.push(`http://${entry.address}:${port}`);
    }
  }
  return [...new Set(urls)];
}

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, () => {
  const urls = localUrls(env.PORT, env.HOST);
  console.log(`API ready: ${urls.join(" | ")} (bind ${env.HOST}:${env.PORT})`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });
}
