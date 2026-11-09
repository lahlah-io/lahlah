import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "../../src/db/client.js";
import { mergeNearDuplicates, persistPlaces } from "../../src/scripts/destinations/persist.js";
import type { CanonicalPlace } from "../../src/scripts/destinations/types.js";

const suffix = randomUUID().slice(0, 8);
const firstName = `Uji Scrape Air Manis ${suffix}`;
const secondName = `Air Manis Beach ${suffix}`;

function place(overrides: Partial<CanonicalPlace>): CanonicalPlace {
  return {
    canonicalKey: firstName.toLowerCase(),
    source: "geoapify",
    sourcePlaceId: `uji-dedupe-${suffix}`,
    name: firstName,
    description: "Pantai dengan batu Malin Kundang",
    address: null,
    latitude: -1.0,
    longitude: 100.4,
    imageUrl: null,
    categorySlugs: ["pantai", "alam"],
    details: {},
    ...overrides,
  };
}

test("menggabungkan dua baris berdekatan dengan nama mirip", async () => {
  const first = place({});
  const second = place({
    canonicalKey: secondName.toLowerCase(),
    source: "firecrawl",
    sourcePlaceId: `uji-dedupe-b-${suffix}`,
    name: secondName,
    description: null,
    latitude: -1.0005,
    categorySlugs: ["santai"],
  });

  try {
    await persistPlaces([first, second], ["geoapify", "firecrawl"]);
    const result = await mergeNearDuplicates();
    assert.ok(result.merged >= 1);

    const rows = await prisma.destination.findMany({
      where: { canonicalKey: { in: [first.canonicalKey, second.canonicalKey] } },
      include: { categories: { include: { category: true } } },
    });

    const active = rows.filter((row) => row.isActive);
    const retired = rows.filter((row) => !row.isActive);
    assert.equal(active.length, 1);
    assert.equal(retired.length, 1);
    assert.deepEqual(
      active[0]?.categories.map((row) => row.category.slug).sort(),
      ["alam", "pantai", "santai"],
    );
  } finally {
    await prisma.destination.deleteMany({
      where: { canonicalKey: { in: [first.canonicalKey, second.canonicalKey] } },
    });
  }
});

test("tidak menggabungkan nama yang merupakan bagian nama lain", async () => {
  const parent = place({ canonicalKey: `uji-scrape-pantai-padang-${suffix}`, name: `Uji Pantai Padang ${suffix}`, sourcePlaceId: `uji-p-${suffix}` });
  const child = place({
    canonicalKey: `uji-scrape-pantai-padang-selatan-${suffix}`,
    name: `Uji Pantai Padang Selatan ${suffix}`,
    sourcePlaceId: `uji-c-${suffix}`,
    latitude: -1.0005,
  });

  try {
    await persistPlaces([parent, child], ["geoapify"]);
    await mergeNearDuplicates();

    const rows = await prisma.destination.findMany({
      where: { canonicalKey: { in: [parent.canonicalKey, child.canonicalKey] } },
    });
    assert.equal(rows.filter((row) => row.isActive).length, 2);
  } finally {
    await prisma.destination.deleteMany({
      where: { canonicalKey: { in: [parent.canonicalKey, child.canonicalKey] } },
    });
  }
});
