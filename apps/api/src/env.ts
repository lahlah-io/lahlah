import { existsSync } from "node:fs";

// Node 24 reads .env natively, so no dotenv dependency is needed.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: required("DATABASE_URL"),
  peridotClientId: required("PERIDOT_CLIENT_ID"),
  peridotClientSecret: process.env.PERIDOT_CLIENT_SECRET ?? "",
  sessionTokenPepper: required("SESSION_TOKEN_PEPPER"),
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
  appOrigin: process.env.APP_ORIGIN ?? "http://localhost:5173",
  adminOrigin: process.env.ADMIN_ORIGIN ?? "http://localhost:5174",
};
