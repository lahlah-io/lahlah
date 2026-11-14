/*
  Warnings:

  - You are about to drop the `itinerary_drafts` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TripRole" AS ENUM ('owner', 'editor', 'viewer');

-- AlterTable
ALTER TABLE "itinerary" ADD COLUMN     "trip_id" UUID;

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "session_id" UUID,
    "title" VARCHAR NOT NULL,
    "description" TEXT,
    "city" VARCHAR(100) NOT NULL DEFAULT 'Padang',
    "start_date" DATE,
    "end_date" DATE,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_trips" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "role" "TripRole" NOT NULL DEFAULT 'owner',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_trips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trips_session_id_key" ON "trips"("session_id");

-- CreateIndex
CREATE INDEX "user_trips_user_id_idx" ON "user_trips"("user_id");

-- CreateIndex
CREATE INDEX "user_trips_trip_id_idx" ON "user_trips"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_trips_user_id_trip_id_key" ON "user_trips"("user_id", "trip_id");

-- Backfill trips dari itinerary yang sudah ada
INSERT INTO "trips" ("id", "session_id", "title", "city", "start_date", "created_at", "updated_at")
SELECT 
    gen_random_uuid(), 
    i."session_id", 
    i."title", 
    i."city", 
    i."trip_date", 
    i."created_at", 
    i."updated_at"
FROM "itinerary" i
WHERE i."session_id" IS NOT NULL
ON CONFLICT ("session_id") DO NOTHING;

-- Tautkan itinerary ke trip yang bersangkutan
UPDATE "itinerary" i
SET "trip_id" = t."id"
FROM "trips" t
WHERE i."session_id" IS NOT NULL AND t."session_id" = i."session_id";

-- Buat membership owner pada user_trips
INSERT INTO "user_trips" ("id", "user_id", "trip_id", "role", "created_at")
SELECT 
    gen_random_uuid(), 
    i."user_id", 
    i."trip_id", 
    'owner'::"TripRole", 
    now()
FROM "itinerary" i
WHERE i."trip_id" IS NOT NULL
ON CONFLICT ("user_id", "trip_id") DO NOTHING;

-- DropForeignKey
ALTER TABLE "itinerary_drafts" DROP CONSTRAINT "itinerary_drafts_itinerary_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_drafts" DROP CONSTRAINT "itinerary_drafts_session_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_drafts" DROP CONSTRAINT "itinerary_drafts_user_id_fkey";

-- DropTable
DROP TABLE "itinerary_drafts";

-- AddForeignKey
ALTER TABLE "itinerary" ADD CONSTRAINT "itinerary_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_trips" ADD CONSTRAINT "user_trips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_trips" ADD CONSTRAINT "user_trips_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
