import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExportSeedFile,
  buildSeedFile,
  mergeCanonicalByName,
  parseScrapeArgs,
  renderReviewHtml,
  toSeedDestination,
} from "../../../src/scripts/destinations/export.js";

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

test("buildExportSeedFile builds seed payload from canonical places", () => {
  const file = buildExportSeedFile([base], "Padang export", "2026-11-14T00:00:00.000Z");
  assert.equal(file.scope, "Padang export");
  assert.equal(file.destinations.length, 1);
  assert.equal(file.destinations[0]?.latitude, "-0.9");
});

test("parseScrapeArgs recognizes export, out and html flags", () => {
  const args = parseScrapeArgs([
    "node",
    "scrape-destinations.ts",
    "--export=out/review.json",
    "--html",
    "out/review.html",
    "--source=geoapify",
  ]);
  assert.equal(args.exportPath, "out/review.json");
  assert.equal(args.htmlPath, "out/review.html");
  assert.equal(args.source, "geoapify");
  assert.equal(args.dryRun, false);
});

test("parseScrapeArgs treats --out as export alias and keeps dry-run", () => {
  const args = parseScrapeArgs(["node", "script", "--out", "out.json", "--dry-run"]);
  assert.equal(args.exportPath, "out.json");
  assert.equal(args.htmlPath, "out.html");
  assert.equal(args.dryRun, true);
});
