import assert from "node:assert/strict";
import test from "node:test";
import { fetchManual } from "../../../src/scripts/destinations/sources/manual.js";
import { CATEGORY_NAMES } from "../../../src/scripts/destinations/categories.js";

test("daftar manual tidak kosong dan semua berasal dari sumber manual", async () => {
  const places = await fetchManual();
  assert.ok(places.length >= 10);
  assert.ok(places.every((place) => place.source === "manual"));
});

test("sourcePlaceId unik", async () => {
  const places = await fetchManual();
  assert.equal(new Set(places.map((place) => place.sourcePlaceId)).size, places.length);
});

test("semua kategori dikenal", async () => {
  const places = await fetchManual();
  for (const place of places) {
    for (const slug of place.rawCategories) {
      assert.ok(slug in CATEGORY_NAMES, `kategori tidak dikenal: ${slug}`);
    }
  }
});
