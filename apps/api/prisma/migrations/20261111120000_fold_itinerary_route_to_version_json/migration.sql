-- DropForeignKey
ALTER TABLE "itinerary_routes" DROP CONSTRAINT "itinerary_routes_from_stop_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_routes" DROP CONSTRAINT "itinerary_routes_itinerary_version_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_routes" DROP CONSTRAINT "itinerary_routes_to_stop_id_fkey";

-- AlterTable
ALTER TABLE "itinerary_stops" ADD COLUMN     "snapshot_json" JSONB;

-- AlterTable
ALTER TABLE "itinerary_versions" ADD COLUMN     "expires_at" TIMESTAMPTZ,
ADD COLUMN     "route_json" JSONB,
ADD COLUMN     "source_message_id" UUID;

-- Backfill route_json from per-leg rows before the table is dropped.
UPDATE "itinerary_versions" v
SET "route_json" = jsonb_build_object(
  'type', 'LineString',
  'coordinates', COALESCE((
    SELECT jsonb_agg(jsonb_build_array(s."longitude"::float8, s."latitude"::float8) ORDER BY s."position")
    FROM "itinerary_stops" s
    WHERE s."itinerary_version_id" = v."id"
  ), '[]'::jsonb),
  'legs', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'fromPosition', fs."position",
      'toPosition', ts."position",
      'transportMode', r."transport_mode",
      'distanceM', r."distance_m",
      'durationSec', r."duration_sec",
      'geometry', r."geometry_json",
      'provider', r."provider",
      'profile', r."provider_profile",
      'fallback', r."fallback"
    ) ORDER BY fs."position")
    FROM "itinerary_routes" r
    JOIN "itinerary_stops" fs ON fs."id" = r."from_stop_id"
    JOIN "itinerary_stops" ts ON ts."id" = r."to_stop_id"
    WHERE r."itinerary_version_id" = v."id"
  ), '[]'::jsonb)
)
WHERE EXISTS (
  SELECT 1 FROM "itinerary_routes" r WHERE r."itinerary_version_id" = v."id"
);

-- DropTable
DROP TABLE "itinerary_routes";

-- AddForeignKey
ALTER TABLE "itinerary_versions" ADD CONSTRAINT "itinerary_versions_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
