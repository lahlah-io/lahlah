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
    GEOAPIFY_API_KEY: z.string().default(""),
    FIRECRAWL_API_KEY: z.string().default(""),
    SCRAPE_CITY: z.string().min(1).default("Padang"),
    SCRAPE_LIMIT: z.coerce.number().int().min(1).max(500).default(200),
    SCRAPE_USER_AGENT: z.string().min(1).default("LahlahBot/1.0 (admin@lahlah.local)"),
    AI_BASE_URL: z.string().default(""),
    AI_API_KEY: z.string().default(""),
    AI_PROVIDER: z.string().default("openai-compatible"),
    AI_CLASSIFIER_MODEL: z.string().default(""),
    AI_TOOL_MODEL: z.string().default(""),
    AI_CLASSIFIER_BASE_URL: z.string().default(""),
    AI_CLASSIFIER_API_KEY: z.string().default(""),
    AI_CLASSIFIER_PROVIDER: z.string().default(""),
    AI_TOOL_BASE_URL: z.string().default(""),
    AI_TOOL_API_KEY: z.string().default(""),
    AI_TOOL_PROVIDER: z.string().default(""),
    AI_TOOL_MAX_ROUNDS: z.coerce.number().int().min(1).max(10).default(3),
    DRAFT_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(1800),
  })
  .parse(process.env);
