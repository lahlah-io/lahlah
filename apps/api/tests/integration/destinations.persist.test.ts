import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "../../src/db/client.js";
import { persistPlaces } from "../../src/scripts/destinations/persist.js";
import type { CanonicalPlace } from "../../src/scripts/destinations/types.js";

const suffix = randomUUID().slice(0, 8);

function place(overrides: Partial<CanonicalPlace>): CanonicalPlace {
  return {
    canonicalKey: `uji-scrape-pantai-${suffix}`,
    source: "geoapify",
    sourcePlaceId: `uji-${suffix}`,
    name: `Uji Scrape Pantai ${suffix}`,
    description: null,
    address: null,
    latitude: -0.95,
    longitude: 100.41,
    imageUrl: null,
    categorySlugs: ["pantai", "alam"],
    details: { primarySource: "geoapify", mergedSources: [] },
    ...overrides,
  };
}

test("upsert idempoten dan menyimpan asal data", async () => {
  const first = place({});
  try {
    const one = await persistPlaces([first], ["geoapify"]);
    assert.equal(one.saved, 1);

    const second = place({
      source: "firecrawl",
      sourcePlaceId: "pantai-padang",
      description: "Dari blog",
      details: {
        primarySource: "firecrawl",
        mergedSources: [{ source: "firecrawl", sourcePlaceId: "pantai-padang" }],
      },
    });
    await persistPlaces([second], ["firecrawl"]);

    const stored = await prisma.destination.findUnique({
      where: { canonicalKey: first.canonicalKey },
      include: { categories: { include: { category: true } } },
    });

    assert.ok(stored);
    assert.equal(stored.source, "firecrawl");
    assert.equal(stored.description, "Dari blog");
    assert.deepEqual(
      stored.categories.map((row) => row.category.slug).sort(),
      ["alam", "pantai"],
    );
  } finally {
    await prisma.destination.deleteMany({ where: { canonicalKey: first.canonicalKey } });
  }
});

test("menonaktifkan baris basi hanya untuk sumber yang berhasil", async () => {
  const stale = place({ canonicalKey: `uji-scrape-basi-${suffix}`, source: "overpass" });
  const kept = place({ canonicalKey: `uji-scrape-tetap-${suffix}`, source: "manual" });

  try {
    await persistPlaces([stale, kept], ["overpass", "manual"]);
    await persistPlaces([kept], ["manual"]);

    const staleRow = await prisma.destination.findUnique({
      where: { canonicalKey: stale.canonicalKey },
    });
    const keptRow = await prisma.destination.findUnique({
      where: { canonicalKey: kept.canonicalKey },
    });

    assert.equal(staleRow?.isActive, true, "overpass tidak ada di successfulSources");
    assert.equal(keptRow?.isActive, true);
  } finally {
    await prisma.destination.deleteMany({
      where: { canonicalKey: { in: [stale.canonicalKey, kept.canonicalKey] } },
    });
  }
});

test("run kosong tidak menonaktifkan apa pun", async () => {
  const existing = place({ canonicalKey: `uji-scrape-kosong-${suffix}` });

  try {
    await persistPlaces([existing], ["geoapify"]);
    const result = await persistPlaces([], ["geoapify"]);
    assert.equal(result.deactivated, 0);

    const row = await prisma.destination.findUnique({
      where: { canonicalKey: existing.canonicalKey },
    });
    assert.equal(row?.isActive, true);
  } finally {
    await prisma.destination.deleteMany({
      where: { canonicalKey: existing.canonicalKey },
    });
  }
});
