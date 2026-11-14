import { buildExportSeedFile, parseScrapeArgs, writeReviewFiles } from "./destinations/export.js";
import { mergePlaces } from "./destinations/normalize.js";
import { fetchFirecrawl } from "./destinations/sources/firecrawl.js";
import { fetchGeoapify, geocodeMissingCoordinates } from "./destinations/sources/geoapify.js";
import { fetchManual } from "./destinations/sources/manual.js";
import { fetchOverpass } from "./destinations/sources/overpass.js";
import { fetchWikidata } from "./destinations/sources/wikidata.js";
import type { CanonicalPlace, PlaceSource, RawPlace } from "./destinations/types.js";

const SOURCES = {
  geoapify: fetchGeoapify,
  firecrawl: fetchFirecrawl,
  overpass: fetchOverpass,
  wikidata: fetchWikidata,
  manual: fetchManual,
} satisfies Record<string, () => Promise<RawPlace[]>>;

const args = parseScrapeArgs(process.argv);
const selected = (args.source ? [args.source] : Object.keys(SOURCES)) as Array<keyof typeof SOURCES>;

if (args.source && !(args.source in SOURCES)) {
  console.error(`Sumber tidak dikenal: ${args.source}. Pilihan: ${Object.keys(SOURCES).join(", ")}`);
  process.exit(1);
}

const places: RawPlace[] = [];
const succeeded: PlaceSource[] = [];

for (const name of selected) {
  try {
    const found = await SOURCES[name]();
    places.push(...found);
    succeeded.push(name);
    console.log(`${name}: ${found.length} tempat`);
  } catch (error) {
    console.error(`${name}: dilewati (${(error as Error).message})`);
  }
}

const merged = mergePlaces(places);
console.log(`Gabungan: ${merged.length} destinasi dari ${places.length} baris mentah`);

function logExportSummary(items: CanonicalPlace[], exportPath: string, htmlPath: string) {
  const byCategory = new Map<string, number>();
  const bySource = new Map<string, number>();
  for (const item of items) {
    bySource.set(item.source, (bySource.get(item.source) ?? 0) + 1);
    for (const slug of item.categorySlugs) byCategory.set(slug, (byCategory.get(slug) ?? 0) + 1);
  }
  console.log(`Export JSON: ${exportPath}`);
  console.log(`Export HTML: ${htmlPath}`);
  console.log(`Kategori: ${JSON.stringify(Object.fromEntries([...byCategory.entries()].sort()))}`);
  console.log(`Sumber: ${JSON.stringify(Object.fromEntries([...bySource.entries()].sort()))}`);
}

if (args.exportPath) {
  const withCoordinates = await geocodeMissingCoordinates(merged);
  const seedFile = buildExportSeedFile(withCoordinates, "Padang destinations review export");
  const htmlPath = args.htmlPath ?? args.exportPath.replace(/\.json$/i, "") + ".html";
  await writeReviewFiles(args.exportPath, htmlPath, seedFile);
  logExportSummary(withCoordinates, args.exportPath, htmlPath);
} else if (args.dryRun) {
  console.log(JSON.stringify(merged.slice(0, 10), null, 2));
} else {
  const [{ prisma }, { mergeNearDuplicates, persistPlaces }] = await Promise.all([
    import("../db/client.js"),
    import("./destinations/persist.js"),
  ]);
  try {
    const withCoordinates = await geocodeMissingCoordinates(merged);
    console.log(await persistPlaces(withCoordinates, succeeded));
    console.log(await mergeNearDuplicates());
  } finally {
    await prisma.$disconnect();
  }
}
