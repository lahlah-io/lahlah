import { prisma } from "../db/client.js";
import { mergePlaces } from "./destinations/normalize.js";
import { mergeNearDuplicates, persistPlaces } from "./destinations/persist.js";
import { fetchFirecrawl } from "./destinations/sources/firecrawl.js";
import { fetchGeoapify, geocodeMissingCoordinates } from "./destinations/sources/geoapify.js";
import { fetchManual } from "./destinations/sources/manual.js";
import { fetchOverpass } from "./destinations/sources/overpass.js";
import { fetchWikidata } from "./destinations/sources/wikidata.js";
import type { PlaceSource, RawPlace } from "./destinations/types.js";

const SOURCES = {
  geoapify: fetchGeoapify,
  firecrawl: fetchFirecrawl,
  overpass: fetchOverpass,
  wikidata: fetchWikidata,
  manual: fetchManual,
} satisfies Record<string, () => Promise<RawPlace[]>>;

const dryRun = process.argv.includes("--dry-run");
const only = process.argv.find((arg) => arg.startsWith("--source="))?.split("=")[1];
const selected = (only ? [only] : Object.keys(SOURCES)) as Array<keyof typeof SOURCES>;

if (only && !(only in SOURCES)) {
  console.error(`Sumber tidak dikenal: ${only}. Pilihan: ${Object.keys(SOURCES).join(", ")}`);
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

if (dryRun) {
  console.log(JSON.stringify(merged.slice(0, 10), null, 2));
} else {
  const withCoordinates = await geocodeMissingCoordinates(merged);
  console.log(await persistPlaces(withCoordinates, succeeded));
  console.log(await mergeNearDuplicates());
}

await prisma.$disconnect();
