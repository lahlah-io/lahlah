import "dotenv/config";
import { z } from "zod";

export const env = z
  .object({
    DATABASE_URL: z
      .url()
      .default("postgres://postgres:123@localhost:5432/lahlah_db")
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
  })
  .parse(process.env);
