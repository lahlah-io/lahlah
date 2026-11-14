-- AlterTable
ALTER TABLE "trip_destinations" RENAME CONSTRAINT "itinerary_destinations_pkey" TO "trip_destinations_pkey";

-- AlterTable
ALTER TABLE "trip_shares" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "trip_views" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_trips" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_url" VARCHAR(2048),
ADD COLUMN     "bio" VARCHAR(160);

-- DropEnum
DROP TYPE "ItineraryStatus";

-- CreateIndex
CREATE INDEX "trip_destinations_trip_id_created_at_idx" ON "trip_destinations"("trip_id", "created_at");

-- RenameForeignKey
ALTER TABLE "destination_checkpoints" RENAME CONSTRAINT "destination_checkpoints_itinerary_destination_id_fkey" TO "destination_checkpoints_trip_destination_id_fkey";

-- RenameForeignKey
ALTER TABLE "trip_destinations" RENAME CONSTRAINT "itinerary_destinations_destination_id_fkey" TO "trip_destinations_destination_id_fkey";

-- RenameForeignKey
ALTER TABLE "trips" RENAME CONSTRAINT "trips_session_id_fkey" TO "trips_chat_session_id_fkey";

-- RenameIndex
ALTER INDEX "itinerary_destinations_itinerary_id_visit_at_idx" RENAME TO "trip_destinations_trip_id_visit_at_idx";

-- RenameIndex
ALTER INDEX "trips_session_id_key" RENAME TO "trips_chat_session_id_key";
