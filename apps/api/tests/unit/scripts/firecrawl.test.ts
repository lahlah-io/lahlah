import assert from "node:assert/strict";
import test from "node:test";
import {
  extractSearchUrls,
  parseFirecrawlPlaces,
} from "../../../src/scripts/destinations/sources/firecrawl.js";

test("membaca places dari respons scrape", () => {
  const places = parseFirecrawlPlaces({
    success: true,
    data: {
      json: {
        places: [
          {
            name: "Pantai Padang",
            description: "Pantai di pusat kota.",
            address: "Padang",
            categories: ["pantai"],
          },
          { name: "" },
        ],
      },
    },
  });

  assert.equal(places.length, 1);
  assert.equal(places[0]?.source, "firecrawl");
  assert.equal(places[0]?.sourcePlaceId, "pantai-padang");
  assert.deepEqual(places[0]?.rawCategories, ["pantai"]);
});

test("respons tanpa places menghasilkan array kosong", () => {
  assert.deepEqual(parseFirecrawlPlaces({ data: { json: {} } }), []);
  assert.deepEqual(parseFirecrawlPlaces(null), []);
});

test("extractSearchUrls membaca data.web", () => {
  assert.deepEqual(
    extractSearchUrls({ data: { web: [{ url: "https://a.test" }, { url: "https://b.test" }] } }),
    ["https://a.test", "https://b.test"],
  );
});

test("extractSearchUrls membaca data berupa array", () => {
  assert.deepEqual(extractSearchUrls({ data: [{ url: "https://a.test" }] }), ["https://a.test"]);
  assert.deepEqual(extractSearchUrls({ data: { web: [{ url: 42 }] } }), []);
});
