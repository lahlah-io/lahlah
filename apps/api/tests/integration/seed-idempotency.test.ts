// apps/api/tests/integration/seed-idempotency.test.ts
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import test from "node:test";
import { prisma } from "../../src/db/client.js";

function runSeed() {
  execSync("pnpm exec prisma db seed", { stdio: ["ignore", "pipe", "pipe"] });
}

async function seedCounts() {
  const categories = await prisma.category.count({
    where: { slug: { startsWith: "seed-" } },
  });
  const destinations = await prisma.destination.count({
    where: { source: "admin", sourcePlaceId: { startsWith: "seed-padang-" } },
  });
  const links = await prisma.destinationCategory.count({
    where: {
      destination: { source: "admin", sourcePlaceId: { startsWith: "seed-padang-" } },
    },
  });
  return { categories, destinations, links };
}

test("seed Padang idempotent saat dijalankan dua kali", { timeout: 180_000 }, async () => {
  runSeed();
  const first = await seedCounts();
  assert.equal(first.categories, 5);
  assert.equal(first.destinations, 7);
  assert.equal(first.links, 13);

  runSeed();
  const second = await seedCounts();
  assert.deepEqual(second, first);

  const rows = await prisma.destination.findMany({
    where: { source: "admin", sourcePlaceId: { startsWith: "seed-padang-" } },
  });
  for (const row of rows) {
    assert.equal(row.city, "Padang");
    const details = row.details as { estimated_duration_minutes?: unknown };
    assert.equal(typeof details.estimated_duration_minutes, "number");
  }
});
