-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ItineraryStatus_new" AS ENUM ('draft', 'confirmed', 'archived', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "itinerary"
  ADD COLUMN "current_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "trip_date" DATE,
  ADD COLUMN "duration_days" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "city" VARCHAR(100) NOT NULL DEFAULT 'Padang',
  ADD COLUMN "transport_mode" VARCHAR;

-- Migrate status enum (final -> confirmed)
ALTER TABLE "itinerary"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "ItineraryStatus_new"
    USING (
      CASE
        WHEN "status"::text = 'final' THEN 'confirmed'::"ItineraryStatus_new"
        ELSE "status"::text::"ItineraryStatus_new"
      END
    ),
  ALTER COLUMN "status" SET DEFAULT 'draft'::"ItineraryStatus_new";

DROP TYPE "ItineraryStatus";
ALTER TYPE "ItineraryStatus_new" RENAME TO "ItineraryStatus";

-- CreateTable
CREATE TABLE "itinerary_versions" (
  "id" UUID NOT NULL,
  "itinerary_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "based_on_version" INTEGER,
  "change_instruction" TEXT,
  "change_type" VARCHAR NOT NULL,
  "total_distance_m" INTEGER,
  "total_duration_min" INTEGER,
  "total_estimated_min" INTEGER,
  "status" VARCHAR NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "itinerary_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_stops" (
  "id" UUID NOT NULL,
  "itinerary_version_id" UUID NOT NULL,
  "destination_id" UUID,
  "position" INTEGER NOT NULL,
  "name" VARCHAR NOT NULL,
  "latitude" DECIMAL(10,7) NOT NULL,
  "longitude" DECIMAL(10,7) NOT NULL,
  "arrival_time" VARCHAR,
  "departure_time" VARCHAR,
  "visit_duration_min" INTEGER,
  "travel_duration_min" INTEGER,
  "notes" TEXT,
  "category" VARCHAR,
  CONSTRAINT "itinerary_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_routes" (
  "id" UUID NOT NULL,
  "itinerary_version_id" UUID NOT NULL,
  "from_stop_id" UUID NOT NULL,
  "to_stop_id" UUID NOT NULL,
  "transport_mode" VARCHAR NOT NULL,
  "distance_m" INTEGER,
  "duration_sec" INTEGER,
  "geometry_json" JSONB,
  "provider" VARCHAR,
  "provider_profile" VARCHAR,
  "fallback" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "itinerary_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_drafts" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "itinerary_id" UUID,
  "payload" JSONB NOT NULL,
  "status" VARCHAR NOT NULL DEFAULT 'pending_confirmation',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  "expires_at" TIMESTAMPTZ,
  CONSTRAINT "itinerary_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "itinerary_versions_itinerary_id_version_key" ON "itinerary_versions"("itinerary_id", "version");
CREATE INDEX "itinerary_versions_itinerary_id_version_idx" ON "itinerary_versions"("itinerary_id", "version");
CREATE UNIQUE INDEX "itinerary_stops_itinerary_version_id_position_key" ON "itinerary_stops"("itinerary_version_id", "position");
CREATE INDEX "itinerary_stops_itinerary_version_id_position_idx" ON "itinerary_stops"("itinerary_version_id", "position");
CREATE UNIQUE INDEX "itinerary_drafts_session_id_key" ON "itinerary_drafts"("session_id");
CREATE INDEX "itinerary_drafts_session_id_idx" ON "itinerary_drafts"("session_id");

-- AddForeignKey
ALTER TABLE "itinerary_versions" ADD CONSTRAINT "itinerary_versions_itinerary_id_fkey"
  FOREIGN KEY ("itinerary_id") REFERENCES "itinerary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "itinerary_stops" ADD CONSTRAINT "itinerary_stops_itinerary_version_id_fkey"
  FOREIGN KEY ("itinerary_version_id") REFERENCES "itinerary_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "itinerary_stops" ADD CONSTRAINT "itinerary_stops_destination_id_fkey"
  FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "itinerary_routes" ADD CONSTRAINT "itinerary_routes_itinerary_version_id_fkey"
  FOREIGN KEY ("itinerary_version_id") REFERENCES "itinerary_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "itinerary_routes" ADD CONSTRAINT "itinerary_routes_from_stop_id_fkey"
  FOREIGN KEY ("from_stop_id") REFERENCES "itinerary_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "itinerary_routes" ADD CONSTRAINT "itinerary_routes_to_stop_id_fkey"
  FOREIGN KEY ("to_stop_id") REFERENCES "itinerary_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "itinerary_drafts" ADD CONSTRAINT "itinerary_drafts_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "itinerary_drafts" ADD CONSTRAINT "itinerary_drafts_itinerary_id_fkey"
  FOREIGN KEY ("itinerary_id") REFERENCES "itinerary"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "itinerary_drafts" ADD CONSTRAINT "itinerary_drafts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: defaults for existing itineraries and create v1 snapshots
UPDATE "itinerary"
SET
  "current_version" = 1,
  "duration_days" = COALESCE("duration_days", 1),
  "city" = COALESCE(NULLIF("city", ''), 'Padang');

INSERT INTO "itinerary_versions" (
  "id", "itinerary_id", "version", "based_on_version", "change_instruction",
  "change_type", "total_distance_m", "total_duration_min", "total_estimated_min",
  "status", "created_at"
)
SELECT
  gen_random_uuid(),
  i."id",
  1,
  NULL,
  NULL,
  'initial',
  NULL,
  NULL,
  NULL,
  CASE WHEN i."status"::text = 'confirmed' THEN 'confirmed' ELSE 'draft' END,
  i."created_at"
FROM "itinerary" i
WHERE NOT EXISTS (
  SELECT 1 FROM "itinerary_versions" v WHERE v."itinerary_id" = i."id" AND v."version" = 1
);

INSERT INTO "itinerary_stops" (
  "id", "itinerary_version_id", "destination_id", "position", "name",
  "latitude", "longitude", "arrival_time", "departure_time",
  "visit_duration_min", "travel_duration_min", "notes", "category"
)
SELECT
  gen_random_uuid(),
  v."id",
  ranked."destination_id",
  ranked.pos,
  ranked.name,
  ranked.lat,
  ranked.lon,
  NULL,
  NULL,
  NULL,
  NULL,
  ranked.notes,
  NULL
FROM (
  SELECT
    idst."itinerary_id",
    idst."destination_id",
    d."name",
    COALESCE(d."latitude", 0)::decimal(10,7) AS lat,
    COALESCE(d."longitude", 0)::decimal(10,7) AS lon,
    idst."notes",
    ROW_NUMBER() OVER (
      PARTITION BY idst."itinerary_id"
      ORDER BY idst."visit_at" ASC NULLS LAST, idst."created_at" ASC, idst."id" ASC
    )::int AS pos
  FROM "itinerary_destinations" idst
  JOIN "destinations" d ON d."id" = idst."destination_id"
) ranked
JOIN "itinerary_versions" v ON v."itinerary_id" = ranked."itinerary_id" AND v."version" = 1;
