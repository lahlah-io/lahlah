import assert from "node:assert/strict";
import test from "node:test";
import { parseGosomResults } from "../../../src/scripts/destinations/sources/gosom.js";

test("parseGosomResults maps CSV rows to RawPlace with tolerant columns", () => {
  const csv = [
    "name,lat,long,full_address,category,link,description",
    "Pantai Air Manis,-0.995,100.361,\"Air Manis, Padang\",Beach,https://maps.google.com/?cid=123,Sunset beach",
    "Museum Adityawarman,-0.955,100.356,\"Jl. Diponegoro, Padang\",Museum,https://example.com/museum,History museum",
  ].join("\n");

  const places = parseGosomResults(csv, "csv", ["pantai", "alam"]);

  assert.equal(places.length, 2);
  assert.deepEqual(places[0], {
    source: "manual",
    sourcePlaceId: "https://maps.google.com/?cid=123",
    name: "Pantai Air Manis",
    description: "Sunset beach",
    address: "Air Manis, Padang",
    latitude: -0.995,
    longitude: 100.361,
    imageUrl: null,
    rawCategories: ["pantai", "alam", "Beach"],
    details: {
      provider: "gosom",
      link: "https://maps.google.com/?cid=123",
      rawCategory: "Beach",
    },
  });
  assert.equal(places[1]?.sourcePlaceId, "https://example.com/museum");
  assert.equal(places[1]?.latitude, -0.955);
  assert.equal(places[1]?.longitude, 100.356);
  assert.equal(places[1]?.address, "Jl. Diponegoro, Padang");
});

test("parseGosomResults accepts column name variants and skips rows without name", () => {
  const csv = [
    "title,latitude,lon,address,categories,url,data_id",
    "Sate Mak Syukur,-0.95,100.36,Padang Barat,Kuliner,https://maps.google.com/?cid=9,place-9",
    "No Coords,,,Padang,Kuliner,https://maps.google.com/?cid=10,place-10",
    ",-0.9,100.3,Padang,Kuliner,https://maps.google.com/?cid=11,place-11",
  ].join("\n");

  const places = parseGosomResults(csv, "csv", ["kuliner"]);

  assert.equal(places.length, 2);
  assert.equal(places[0]?.name, "Sate Mak Syukur");
  assert.equal(places[0]?.latitude, -0.95);
  assert.equal(places[0]?.longitude, 100.36);
  assert.equal(places[0]?.sourcePlaceId, "https://maps.google.com/?cid=9");
  assert.deepEqual(places[0]?.rawCategories, ["kuliner", "Kuliner"]);
  assert.equal(places[1]?.name, "No Coords");
  assert.equal(places[1]?.latitude, null);
  assert.equal(places[1]?.longitude, null);
  assert.equal(places[1]?.sourcePlaceId, "https://maps.google.com/?cid=10");
});
