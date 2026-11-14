-- ERD baru: trip_destinations menjadi satu-satunya penyimpanan itinerary.
-- Satu "versi" = kelompok baris trip_destinations dengan created_at identik per trip.

-- 1. Expand
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS "chat_sessions_user_id_deleted_at_idx" ON "chat_sessions" ("user_id", "deleted_at");

ALTER TABLE "trip_destinations" ADD COLUMN IF NOT EXISTS "distance" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "trip_likes" (
  "user_id" UUID NOT NULL,
  "trip_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "trip_likes_pkey" PRIMARY KEY ("user_id", "trip_id"),
  CONSTRAINT "trip_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trip_likes_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "trip_likes_trip_id_idx" ON "trip_likes" ("trip_id");

CREATE TABLE IF NOT EXISTS "trip_views" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "trip_id" UUID NOT NULL,
  "user_id" UUID,
  "visitor_hash" VARCHAR,
  "viewed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "trip_views_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "trip_views_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trip_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "trip_views_trip_id_viewed_at_idx" ON "trip_views" ("trip_id", "viewed_at");

CREATE TABLE IF NOT EXISTS "trip_shares" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "trip_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "channel" VARCHAR NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "trip_shares_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "trip_shares_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trip_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "trip_shares_trip_id_created_at_idx" ON "trip_shares" ("trip_id", "created_at");

-- 2. Backfill: trip yang belum punya trip_destinations mengambil stop versi aktifnya.
INSERT INTO "trip_destinations" ("id", "trip_id", "destination_id", "visit_at", "notes", "created_at")
SELECT
  gen_random_uuid(),
  v."trip_id",
  s."destination_id",
  (
    COALESCE(t."start_date", (v."created_at" AT TIME ZONE 'Asia/Jakarta')::date)
    + COALESCE(NULLIF(s."arrival_time", '')::time, TIME '00:00')
  ) AT TIME ZONE 'Asia/Jakarta',
  s."notes",
  v."created_at"
FROM "trip_versions" v
JOIN "trips" t ON t."id" = v."trip_id"
JOIN "trip_version_stops" s ON s."trip_version_id" = v."id"
WHERE v."version" = t."current_version"
  AND s."destination_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "trip_destinations" d WHERE d."trip_id" = t."id");

-- 3. Normalisasi: baris lama yang di-insert satu per satu digabung jadi satu batch per trip.
UPDATE "trip_destinations" d
SET "created_at" = x."first_created"
FROM (
  SELECT "trip_id", min("created_at") AS "first_created"
  FROM "trip_destinations"
  GROUP BY "trip_id"
) x
WHERE d."trip_id" = x."trip_id";

-- 4. Contract
ALTER TABLE "trips" RENAME COLUMN "session_id" TO "chat_session_id";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "start_date";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "current_version";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "metadata";

ALTER TABLE "user_trips" DROP COLUMN IF EXISTS "role";

DROP INDEX IF EXISTS "trip_destinations_trip_id_destination_id_key";
ALTER TABLE "trip_destinations" DROP COLUMN IF EXISTS "position";
ALTER TABLE "trip_destinations" DROP COLUMN IF EXISTS "is_active";
DROP INDEX IF EXISTS "itinerary_destinations_itinerary_id_is_active_idx";

DROP TABLE IF EXISTS "trip_version_stops";
DROP TABLE IF EXISTS "trip_versions";
DROP TYPE IF EXISTS "TripRole";
