-- AlterTable
ALTER TABLE "destinations" ADD COLUMN     "district" VARCHAR(100);

-- CreateIndex
CREATE INDEX "destinations_city_district_is_active_idx" ON "destinations"("city", "district", "is_active");
