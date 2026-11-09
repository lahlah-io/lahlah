import "dotenv/config";
import { z } from "zod";

export const env = z
  .object({
    DATABASE_URL: z
      .url({ error: "DATABASE_URL wajib diisi, lihat apps/api/.env.example" })
      .refine((url) => url.startsWith("postgres://") || url.startsWith("postgresql://")),
    PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:5173,http://localhost:5174")
      .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean))
      .pipe(z.array(z.url()).min(1)),
    HOST: z.string().default("0.0.0.0"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    PERIDOT_CLIENT_ID: z
      .string({ error: "PERIDOT_CLIENT_ID wajib diisi, lihat apps/api/.env.example" })
      .trim()
      .min(1),
    PERIDOT_CLIENT_SECRET: z.string().trim().min(1).optional(),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    SESSION_TOKEN_PEPPER: z
      .string({ error: "SESSION_TOKEN_PEPPER wajib diisi, lihat apps/api/.env.example" })
      .min(16),
    ADMIN_EMAILS: z
      .string()
      .default("")
      .transform((value) => value.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean)),
  })
  .parse(process.env);
