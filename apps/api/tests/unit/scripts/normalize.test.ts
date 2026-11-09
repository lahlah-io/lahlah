import assert from "node:assert/strict";
import test from "node:test";
import {
  isTokenSubset,
  mergePlaces,
  normalizeName,
} from "../../../src/scripts/destinations/normalize.js";
import type { RawPlace } from "../../../src/scripts/destinations/types.js";

function place(overrides: Partial<RawPlace>): RawPlace {
  return {
    source: "manual",
    sourcePlaceId: "x",
    name: "Pantai Padang",
    description: null,
    address: null,
    latitude: null,
    longitude: null,
    imageUrl: null,
    rawCategories: [],
    details: {},
    ...overrides,
  };
}

test("normalizeName merapikan nama", () => {
  assert.equal(normalizeName("  Objek Wisata Pantai Padang!! "), "pantai padang");
});

test("mergePlaces menggabungkan sumber dengan nama sama", () => {
  const merged = mergePlaces([
    place({ source: "firecrawl", name: "Pantai Padang", description: "Dari blog" }),
    place({ source: "geoapify", name: "pantai padang", rawCategories: ["natural.beach"] }),
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.source, "geoapify");
  assert.equal(merged[0]?.description, "Dari blog");
  assert.deepEqual(merged[0]?.categorySlugs, ["pantai", "alam", "santai"]);
});

test("firecrawl mengalahkan overpass", () => {
  const merged = mergePlaces([
    place({ source: "overpass", name: "Danau Toba" }),
    place({ source: "firecrawl", name: "Danau Toba" }),
  ]);
  assert.equal(merged[0]?.source, "firecrawl");
});

test("details menyimpan semua sumber", () => {
  const merged = mergePlaces([
    place({ source: "geoapify", sourcePlaceId: "abc" }),
    place({ source: "firecrawl", sourcePlaceId: "pantai-padang" }),
  ]);
  assert.deepEqual(merged[0]?.details.mergedSources, [
    { source: "geoapify", sourcePlaceId: "abc" },
    { source: "firecrawl", sourcePlaceId: "pantai-padang" },
  ]);
});

test("nama kosong dibuang", () => {
  assert.equal(mergePlaces([place({ name: "   " })]).length, 0);
});

test("isTokenSubset mendeteksi nama yang merupakan bagian nama lain", () => {
  assert.equal(isTokenSubset("pantai padang", "pantai padang selatan"), true);
  assert.equal(isTokenSubset("pantai padang", "danau toba"), false);
});
