import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { test } from "vitest";
import { prisma } from "../../src/db/client.js";

function runSeed() {
  execSync("pnpm exec prisma db seed", { stdio: ["ignore", "pipe", "pipe"] });
}

async function seedCounts() {
  const categories = await prisma.category.count();
  const destinations = await prisma.destination.count();
  const links = await prisma.destinationCategory.count();
  // Demo feed rows are scoped by username so parallel tests cannot skew them.
  const user = { username: { startsWith: "seed-" } };
  const users = await prisma.user.count({ where: user });
  const trips = await prisma.trip.count({ where: { members: { some: { user } } } });
  const likes = await prisma.tripLike.count({ where: { user } });
  const views = await prisma.tripView.count({ where: { user } });
  const shares = await prisma.tripShare.count({ where: { user } });
  return { categories, destinations, links, users, trips, likes, views, shares };
}

test("seed Padang idempotent saat dijalankan dua kali", { timeout: 180_000 }, async () => {
  runSeed();
  const first = await seedCounts();
  const seedSlugs = ["alam", "belanja", "budaya", "keluarga", "kuliner", "pantai", "santai", "sejarah"];
  // Hitung absolut rapuh: DB dev bisa berisi kategori nyata lain di luar 8 seed.
  const seeded = await prisma.category.count({ where: { slug: { in: seedSlugs } } });
  assert.equal(seeded, 8);
  assert.ok(first.destinations > 0);

  runSeed();
  const second = await seedCounts();
  assert.deepEqual(second, first);

  const legacyCategories = await prisma.category.count({ where: { slug: { startsWith: "seed-" } } });
  assert.equal(legacyCategories, 0, "kategori dev seed-* tidak boleh tersisa");

  const duplicates = await prisma.$queryRaw<Array<{ slug: string; n: bigint }>>`
    SELECT slug, COUNT(*) AS n FROM categories GROUP BY slug HAVING COUNT(*) > 1
  `;
  assert.deepEqual(duplicates, [], "slug kategori tidak boleh duplikat");
});
