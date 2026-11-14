import assert from "node:assert/strict";
import test from "node:test";
import { buildSeedFile, mergeCanonicalByName, renderReviewHtml, toSeedDestination } from "../../../src/scripts/destinations/export.js";

const base = {
  canonicalKey: "pantai padang",
  source: "geoapify" as const,
  sourcePlaceId: "a",
  name: "Pantai Padang",
  description: "Pantai kota.",
  address: "Padang",
  city: "Padang",
  latitude: -0.9,
  longitude: 100.35,
  imageUrl: null,
  categorySlugs: ["pantai", "alam"],
  details: { mergedSources: [{ source: "geoapify", sourcePlaceId: "a" }] },
};

test("toSeedDestination stringifies coordinates", () => {
  const d = toSeedDestination(base);
  assert.equal(d.latitude, "-0.9");
  assert.equal(d.longitude, "100.35");
  assert.equal(d.name, "Pantai Padang");
});

test("buildSeedFile includes target categories", () => {
  const file = buildSeedFile([base], "2026-11-14T00:00:00.000Z", "Padang review");
  assert.equal(file.destinations.length, 1);
  assert.ok(file.categories.some((c) => c.slug === "alam"));
});

test("mergeCanonicalByName unions categories and keeps best fields", () => {
  const merged = mergeCanonicalByName([
    [base],
    [{ ...base, source: "overpass" as const, sourcePlaceId: "b", description: null, imageUrl: "x", categorySlugs: ["santai"] }],
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(new Set(merged[0]!.categorySlugs), new Set(["pantai", "alam", "santai"]));
  assert.equal(merged[0]!.description, "Pantai kota.");
  assert.equal(merged[0]!.imageUrl, "x");
});

test("renderReviewHtml has delete and download controls", () => {
  const html = renderReviewHtml(buildSeedFile([base], "2026-11-14T00:00:00.000Z", "Padang review"));
  assert.match(html, /Delete|Hapus/);
  assert.match(html, /Download|Unduh/);
  assert.match(html, /Pantai Padang/);
});
