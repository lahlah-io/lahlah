import assert from "node:assert/strict";
import test from "node:test";
import {
  parseOverpassElements,
  rawCategoryTags,
} from "../../../src/scripts/destinations/sources/overpass.js";

test("membaca node dengan nama dan koordinat", () => {
  const places = parseOverpassElements([
    { type: "node", id: 1, lat: -0.9471, lon: 100.4172, tags: { name: "Pantai Padang", natural: "beach" } },
  ]);

  assert.equal(places.length, 1);
  assert.equal(places[0]?.source, "overpass");
  assert.equal(places[0]?.sourcePlaceId, "node/1");
  assert.equal(places[0]?.latitude, -0.9471);
  assert.deepEqual(places[0]?.rawCategories, ["natural=beach"]);
});

test("membaca way memakai center", () => {
  const places = parseOverpassElements([
    { type: "way", id: 2, center: { lat: -1.0, lon: 100.4 }, tags: { name: "Taman", leisure: "park" } },
  ]);
  assert.equal(places[0]?.latitude, -1.0);
});

test("membuang elemen tanpa nama", () => {
  assert.deepEqual(parseOverpassElements([{ type: "node", id: 3, tags: { natural: "beach" } }]), []);
});

test("rawCategoryTags menyusun tag yang dikenal", () => {
  assert.deepEqual(rawCategoryTags({ tourism: "museum", historic: "yes" }), [
    "tourism=museum",
    "historic=*",
  ]);
});
