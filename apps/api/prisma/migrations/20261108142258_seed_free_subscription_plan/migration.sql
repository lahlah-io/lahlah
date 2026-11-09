-- Seed the free subscription plan that every new user receives.
-- Idempotent: running against a database that already has a `free` plan is a no-op.
INSERT INTO "subscription_plans" (
    "id",
    "name",
    "description",
    "price",
    "billing_interval",
    "default_model_id",
    "details",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    'free',
    'Paket gratis untuk setiap pengguna baru',
    0,
    'monthly',
    NULL,
    '{"chatMessagesPerMonth":30,"maxChatSessions":10,"maxItineraries":3,"allowedModelIds":null}'::jsonb,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "subscription_plans" WHERE "name" = 'free');
