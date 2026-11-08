import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Node 24 can read .env without a dotenv dependency. CLI commands run from this
// package, so a missing file just means "use the real environment".
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  // Omitted when unset so `prisma generate` works in CI without a database.
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
