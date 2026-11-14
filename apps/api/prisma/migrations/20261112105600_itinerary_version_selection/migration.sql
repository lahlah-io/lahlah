-- AlterTable
ALTER TABLE "itinerary_destinations" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "position" INTEGER;

-- AlterTable
ALTER TABLE "itinerary_versions" ADD COLUMN     "is_saved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_selected" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "itinerary_destinations_itinerary_id_is_active_idx" ON "itinerary_destinations"("itinerary_id", "is_active");

-- CreateIndex
CREATE INDEX "itinerary_versions_itinerary_id_is_selected_idx" ON "itinerary_versions"("itinerary_id", "is_selected");

-- CreateIndex
CREATE INDEX "itinerary_versions_itinerary_id_is_saved_idx" ON "itinerary_versions"("itinerary_id", "is_saved");

-- Satu versi aktif per itinerary, dijaga database.
CREATE UNIQUE INDEX "itinerary_versions_one_selected_per_itinerary"
  ON "itinerary_versions"("itinerary_id")
  WHERE "is_selected" = true;

-- Itinerary yang sudah confirmed tetap punya versi aktif setelah migrasi.
UPDATE "itinerary_versions" v
SET "is_selected" = true
FROM "itinerary" i
WHERE v."itinerary_id" = i."id"
  AND v."version" = i."current_version"
  AND i."status" = 'confirmed';
