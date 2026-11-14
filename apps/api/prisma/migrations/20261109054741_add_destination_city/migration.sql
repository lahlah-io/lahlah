-- AlterTable
ALTER TABLE "destinations" ADD COLUMN     "city" VARCHAR(100);

-- CreateIndex
CREATE INDEX "destinations_city_is_active_idx" ON "destinations"("city", "is_active");
