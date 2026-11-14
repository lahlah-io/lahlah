import assert from "node:assert/strict";
import test from "node:test";
import { parseWikidataBindings } from "../../../src/scripts/destinations/sources/wikidata.js";

test("membaca binding dengan koordinat", () => {
  const places = parseWikidataBindings([
    {
      item: { value: "http://www.wikidata.org/entity/Q123" },
      itemLabel: { value: "Pantai Padang" },
      itemDescription: { value: "pantai di Kota Padang" },
      coord: { value: "Point(100.4172 -0.9471)" },
      typeLabel: { value: "pantai" },
    },
  ]);

  assert.equal(places.length, 1);
  assert.equal(places[0]?.source, "wikidata");
  assert.equal(places[0]?.sourcePlaceId, "Q123");
  assert.equal(places[0]?.latitude, -0.9471);
  assert.equal(places[0]?.longitude, 100.4172);
  assert.deepEqual(places[0]?.rawCategories, ["natural=beach"]);
});

test("membuang halaman daftar dan item tanpa label", () => {
  assert.deepEqual(
    parseWikidataBindings([
      { item: { value: "http://www.wikidata.org/entity/Q1" }, itemLabel: { value: "" } },
      {
        item: { value: "http://www.wikidata.org/entity/Q2" },
        itemLabel: { value: "Daftar pantai di Padang" },
        itemDescription: { value: "halaman daftar" },
      },
    ]),
    [],
  );
});
