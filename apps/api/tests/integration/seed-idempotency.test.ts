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
  return { categories, destinations, links };
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
