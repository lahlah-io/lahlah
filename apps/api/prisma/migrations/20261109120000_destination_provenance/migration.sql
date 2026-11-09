-- Alter enum (new values appended in order; PostgreSQL 12+ allows ADD VALUE in transaction)
ALTER TYPE "DestinationSource" ADD VALUE IF NOT EXISTS 'firecrawl';
ALTER TYPE "DestinationSource" ADD VALUE IF NOT EXISTS 'overpass';
ALTER TYPE "DestinationSource" ADD VALUE IF NOT EXISTS 'wikidata';
ALTER TYPE "DestinationSource" ADD VALUE IF NOT EXISTS 'manual';

-- Add canonical_key column with unique index
ALTER TABLE "destinations" ADD COLUMN IF NOT EXISTS "canonical_key" VARCHAR;

CREATE UNIQUE INDEX IF NOT EXISTS "destinations_canonical_key_key"
  ON "destinations"("canonical_key");
