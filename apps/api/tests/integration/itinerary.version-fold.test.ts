import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { prisma } from "../../src/db/client.js";

const PREV_NODE_ENV = process.env.NODE_ENV;

afterAll(async () => {
  process.env.NODE_ENV = PREV_NODE_ENV;
});

async function columns(table: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
    table,
  );
  return rows.map((r) => r.column_name);
}

test("trip_versions folds route json, message link, and expiry", async () => {
  const cols = await columns("trip_versions");
  assert.ok(cols.includes("route_json"), "route_json column is missing");
  assert.ok(cols.includes("source_message_id"), "source_message_id column is missing");
  assert.ok(cols.includes("expires_at"), "expires_at column is missing");
});

test("trip_version_stops keeps a snapshot json column", async () => {
  const cols = await columns("trip_version_stops");
  assert.ok(cols.includes("snapshot_json"), "snapshot_json column is missing");
});

test("itinerary_routes is folded away", async () => {
  const rows = await prisma.$queryRawUnsafe<Array<{ t: string | null }>>(
    "SELECT to_regclass('public.itinerary_routes')::text AS t",
  );
  assert.equal(rows[0]?.t, null, "itinerary_routes table should be dropped after the fold");
});
