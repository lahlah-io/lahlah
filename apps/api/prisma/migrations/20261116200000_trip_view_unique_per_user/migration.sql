-- Satu view per user per trip (engagement API is auth-only, so user_id is always set).
CREATE UNIQUE INDEX IF NOT EXISTS "trip_views_trip_id_user_id_key" ON "trip_views"("trip_id", "user_id");
