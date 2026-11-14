-- Fase 1: jadikan trips sebagai agregat tunggal.
-- Semua operasi rename + tambah kolom; tabel `itinerary` belum dihapus (fase kontrak).

-- 1. Lepas FK lama yang menunjuk ke itinerary.
ALTER TABLE "itinerary_versions" DROP CONSTRAINT "itinerary_versions_itinerary_id_fkey";
ALTER TABLE "itinerary_destinations" DROP CONSTRAINT "itinerary_destinations_itinerary_id_fkey";

-- 2. Rename tabel.
ALTER TABLE "itinerary_versions" RENAME TO "trip_versions";
ALTER TABLE "itinerary_destinations" RENAME TO "trip_destinations";
ALTER TABLE "itinerary_stops" RENAME TO "trip_version_stops";

-- 3. Rename kolom FK.
ALTER TABLE "trip_versions" RENAME COLUMN "itinerary_id" TO "trip_id";
ALTER TABLE "trip_destinations" RENAME COLUMN "itinerary_id" TO "trip_id";
ALTER TABLE "trip_version_stops" RENAME COLUMN "itinerary_version_id" TO "trip_version_id";
ALTER TABLE "destination_checkpoints" RENAME COLUMN "itinerary_destination_id" TO "trip_destination_id";

-- 4. Remap nilai: sebelumnya berisi itinerary.id, sekarang harus trips.id.
UPDATE "trip_versions" v SET "trip_id" = i."trip_id"
FROM "itinerary" i WHERE v."trip_id" = i."id";
UPDATE "trip_destinations" d SET "trip_id" = i."trip_id"
FROM "itinerary" i WHERE d."trip_id" = i."id";

-- 5. Gagal keras bila ada baris yatim, jangan lanjut dengan data rusak.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "trip_versions" v LEFT JOIN "trips" t ON t."id" = v."trip_id" WHERE t."id" IS NULL) THEN
    RAISE EXCEPTION 'trip_versions contains rows without a matching trip';
  END IF;
  IF EXISTS (SELECT 1 FROM "trip_destinations" d LEFT JOIN "trips" t ON t."id" = d."trip_id" WHERE t."id" IS NULL) THEN
    RAISE EXCEPTION 'trip_destinations contains rows without a matching trip';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "trip_destinations"
    GROUP BY "trip_id", "destination_id" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'trip_destinations has duplicate (trip_id, destination_id) rows';
  END IF;
END $$;

ALTER TABLE "trip_versions" ALTER COLUMN "trip_id" SET NOT NULL;
ALTER TABLE "trip_destinations" ALTER COLUMN "trip_id" SET NOT NULL;

ALTER TABLE "trip_versions" ADD CONSTRAINT "trip_versions_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trip_destinations" ADD CONSTRAINT "trip_destinations_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Kolom publikasi/versi pindah ke trips, disalin dari itinerary.
ALTER TABLE "trips"
  ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "share_slug" VARCHAR,
  ADD COLUMN "current_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "deleted_at" TIMESTAMPTZ;

UPDATE "trips" t
SET "is_public" = i."is_public",
    "share_slug" = i."share_slug",
    "current_version" = i."current_version",
    "metadata" = i."metadata"
FROM "itinerary" i
WHERE i."trip_id" = t."id";

CREATE UNIQUE INDEX "trips_share_slug_key" ON "trips"("share_slug");

-- 7. Status arsip per anggota + updated_at.
ALTER TABLE "user_trips"
  ADD COLUMN "status" VARCHAR,
  ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 8. Satu baris destinasi per trip.
CREATE UNIQUE INDEX "trip_destinations_trip_id_destination_id_key"
  ON "trip_destinations"("trip_id", "destination_id");

-- 9. Isi set destinasi aktif dari versi current_version.
INSERT INTO "trip_destinations" ("id", "trip_id", "destination_id", "position", "is_active", "visit_at", "estimated_cost", "notes", "created_at")
SELECT gen_random_uuid(), v."trip_id", s."destination_id", s."position", true, NULL, NULL, s."notes", now()
FROM "trip_versions" v
JOIN "trip_version_stops" s ON s."trip_version_id" = v."id"
JOIN "trips" t ON t."id" = v."trip_id" AND t."current_version" = v."version"
WHERE s."destination_id" IS NOT NULL
ON CONFLICT ("trip_id", "destination_id") DO NOTHING;
