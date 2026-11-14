-- Checkpoint geofence: store captured coordinates and allow photo-less check-ins.
ALTER TABLE "destination_checkpoints"
ADD COLUMN     "accuracy_meters" DOUBLE PRECISION,
ADD COLUMN     "distance_meters" DOUBLE PRECISION,
ADD COLUMN     "latitude" DECIMAL(10,7) NOT NULL,
ADD COLUMN     "longitude" DECIMAL(10,7) NOT NULL,
ADD COLUMN     "note" TEXT,
ALTER COLUMN "image_url" DROP NOT NULL;

CREATE INDEX "destination_checkpoints_user_id_created_at_idx"
ON "destination_checkpoints"("user_id", "created_at");

CREATE UNIQUE INDEX "destination_checkpoints_trip_destination_id_user_id_key"
ON "destination_checkpoints"("trip_destination_id", "user_id");
