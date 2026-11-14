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
    APIFY_TOKEN: z.string().default(""),
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
    EMBEDDING_MODEL: z.string().default("Xenova/paraphrase-multilingual-MiniLM-L12-v2"),
    EMBEDDING_TOP_K: z.coerce.number().int().min(1).max(20).default(3),
    EMBEDDING_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.3),
    // Floor fallback top-1: di bawah ini konteks kosong (0.154 = skor tertinggi query off-topic terukur).
    EMBEDDING_FALLBACK_MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.2),
    DRAFT_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(1800),
    OSRM_BASE_URL: z.string().default("https://router.project-osrm.org"),
    OSRM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
    OSRM_CACHE_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  })
  .parse(process.env);
