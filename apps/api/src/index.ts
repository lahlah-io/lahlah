import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { env } from "./env.js";
import { prisma } from "./db/client.js";

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, () => {
  console.log(`API ready at http://${env.HOST}:${env.PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });
}
