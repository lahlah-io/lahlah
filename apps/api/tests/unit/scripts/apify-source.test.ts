import assert from "node:assert/strict";
import test from "node:test";
import {
  inferApifyCategorySlugs,
  mapApifyItemToRaw,
} from "../../../src/scripts/destinations/sources/apify.js";

test("maps apify place to raw destination fields", () => {
  const raw = mapApifyItemToRaw(
    {
      title: "Pantai Air Manis",
      description: "Pantai indah",
      location: { lat: -1, lng: 100.3 },
      address: "Padang",
      placeId: "x",
      categoryName: "Beach",
    },
    ["pantai", "alam"],
  );
  assert.equal(raw?.name, "Pantai Air Manis");
  assert.equal(raw?.latitude, -1);
  assert.ok(raw?.sourcePlaceId);
  assert.equal(raw?.source, "manual");
  assert.equal(raw?.details.provider, "apify");
  assert.deepEqual(inferApifyCategorySlugs({ categoryName: "Beach" }).sort(), ["alam", "pantai"]);
});

test("drops items without name", () => {
  assert.equal(mapApifyItemToRaw({ location: { lat: 1, lng: 2 } }, []), null);
});
