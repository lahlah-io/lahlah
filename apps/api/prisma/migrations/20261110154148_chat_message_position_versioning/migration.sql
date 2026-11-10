-- AlterEnum
ALTER TYPE "MessageRole" ADD VALUE 'tool';

-- AlterTable
ALTER TABLE "chat_sessions"
  ADD COLUMN "status" VARCHAR NOT NULL DEFAULT 'active',
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "context_json" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "completion_tokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "total_tokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_message_at" TIMESTAMPTZ,
  ADD COLUMN "schema_version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "chat_messages"
  ADD COLUMN "position" INTEGER,
  ADD COLUMN "tool_calls_json" JSONB,
  ADD COLUMN "tool_call_id" VARCHAR,
  ADD COLUMN "mode" VARCHAR,
  ADD COLUMN "model" VARCHAR,
  ADD COLUMN "latency_ms" INTEGER,
  ADD COLUMN "status" VARCHAR NOT NULL DEFAULT 'completed',
  ADD COLUMN "error_json" JSONB,
  ADD COLUMN "versions_json" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "active_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "schema_version" INTEGER NOT NULL DEFAULT 1;

-- Backfill token nulls and enforce non-null defaults
UPDATE "chat_messages"
SET
  "input_tokens" = COALESCE("input_tokens", 0),
  "output_tokens" = COALESCE("output_tokens", 0);

ALTER TABLE "chat_messages"
  ALTER COLUMN "input_tokens" SET DEFAULT 0,
  ALTER COLUMN "input_tokens" SET NOT NULL,
  ALTER COLUMN "output_tokens" SET DEFAULT 0,
  ALTER COLUMN "output_tokens" SET NOT NULL;

-- Backfill positions sequential per session ordered by created_at, id
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "session_id" ORDER BY "created_at" ASC, "id" ASC) AS rn
  FROM "chat_messages"
)
UPDATE "chat_messages" m
SET "position" = ranked.rn
FROM ranked
WHERE m."id" = ranked."id";

ALTER TABLE "chat_messages"
  ALTER COLUMN "position" SET NOT NULL;

-- Seed versions_json and active_version for existing rows (preserve content, tokens, metadata, createdAt -> version 1)
UPDATE "chat_messages"
SET
  "versions_json" = jsonb_build_array(
    jsonb_build_object(
      'version', 1,
      'content', "content",
      'inputTokens', COALESCE("input_tokens", 0),
      'outputTokens', COALESCE("output_tokens", 0),
      'metadata', COALESCE("metadata", '{}'::jsonb),
      'createdAt', "created_at"
    )
  ),
  "active_version" = 1;

-- Set ChatSession token totals and last message timestamp
UPDATE "chat_sessions" s
SET
  "prompt_tokens" = COALESCE(t.prompt, 0),
  "completion_tokens" = COALESCE(t.completion, 0),
  "total_tokens" = COALESCE(t.prompt, 0) + COALESCE(t.completion, 0),
  "last_message_at" = t.last_at
FROM (
  SELECT
    "session_id",
    SUM(COALESCE("input_tokens", 0))::int AS prompt,
    SUM(COALESCE("output_tokens", 0))::int AS completion,
    MAX("created_at") AS last_at
  FROM "chat_messages"
  GROUP BY "session_id"
) t
WHERE s."id" = t."session_id";

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_session_id_position_key" ON "chat_messages"("session_id", "position");
CREATE INDEX "chat_messages_session_id_position_idx" ON "chat_messages"("session_id", "position");
