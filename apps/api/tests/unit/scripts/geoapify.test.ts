import assert from "node:assert/strict";
import test from "node:test";
import { parseGeoapifyPlaces } from "../../../src/scripts/destinations/sources/geoapify.js";

test("membaca feature Geoapify", () => {
  const places = parseGeoapifyPlaces([
    {
      properties: {
        place_id: "abc123",
        name: "Pantai Padang",
        address_line2: "Padang, Sumatera Barat",
        lat: -0.9471,
        lon: 100.4172,
        categories: ["natural.beach"],
      },
    },
  ]);

  assert.equal(places.length, 1);
  assert.equal(places[0]?.source, "geoapify");
  assert.equal(places[0]?.sourcePlaceId, "abc123");
  assert.equal(places[0]?.latitude, -0.9471);
  assert.deepEqual(places[0]?.rawCategories, ["natural.beach"]);
});

test("membuang feature tanpa id atau nama", () => {
  assert.deepEqual(parseGeoapifyPlaces([{ properties: { name: "Tanpa id" } }]), []);
  assert.deepEqual(parseGeoapifyPlaces([{ properties: { place_id: "abc" } }]), []);
  assert.deepEqual(parseGeoapifyPlaces([{ properties: null }]), []);
});
