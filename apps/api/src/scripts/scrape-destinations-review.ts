import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSeedFile, mergeCanonicalByName, writeReviewFiles } from "./destinations/export.js";
import { mergePlaces } from "./destinations/normalize.js";
import { fetchApifyPlaces } from "./destinations/sources/apify.js";
import { fetchFirecrawl } from "./destinations/sources/firecrawl.js";
import { fetchGeoapify, geocodeMissingCoordinates } from "./destinations/sources/geoapify.js";
import { parseGosomResults } from "./destinations/sources/gosom.js";
import { fetchManual } from "./destinations/sources/manual.js";
import { fetchOverpass } from "./destinations/sources/overpass.js";
import { fetchWikidata } from "./destinations/sources/wikidata.js";
import type { CanonicalPlace, PlaceSource, RawPlace } from "./destinations/types.js";

const TARGET = ["alam", "kuliner", "budaya", "keluarga", "belanja", "santai", "sejarah"] as const;
const REPO_SOURCES = {
  geoapify: fetchGeoapify,
  firecrawl: fetchFirecrawl,
  overpass: fetchOverpass,
  wikidata: fetchWikidata,
  manual: fetchManual,
} satisfies Record<string, () => Promise<RawPlace[]>>;

function filterTarget(items: CanonicalPlace[]): CanonicalPlace[] {
  const target = new Set<string>(TARGET);
  return items.flatMap((item) => {
    const slugs = item.categorySlugs.filter((s) => target.has(s) || s === "pantai");
    if (slugs.length === 0) return [];
    return [{ ...item, categorySlugs: [...new Set(slugs)] }];
  });
}

async function fetchWithRetry(name: string, fetcher: () => Promise<RawPlace[]>): Promise<RawPlace[]> {
  try {
    return await fetcher();
  } catch (error) {
    console.warn(`repo:${name}: gagal, coba ulang (${(error as Error).message})`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return await fetcher();
  }
}

async function runRepoScrape(): Promise<CanonicalPlace[]> {
  const places: RawPlace[] = [];
  const succeeded: PlaceSource[] = [];
  for (const [name, fetcher] of Object.entries(REPO_SOURCES)) {
    try {
      const found = await fetchWithRetry(name, fetcher);
      places.push(...found);
      succeeded.push(name as PlaceSource);
      console.log(`repo:${name}: ${found.length}`);
    } catch (error) {
      console.warn(`repo:${name}: dilewati (${(error as Error).message})`);
    }
  }
  const merged = mergePlaces(places);
  const withCoordinates = await geocodeMissingCoordinates(merged);
  console.log(`repo: raw=${places.length} merged=${withCoordinates.length} sources=${succeeded.join(",")}`);
  return withCoordinates;
}

async function runApify(): Promise<CanonicalPlace[]> {
  try {
    const raw = await fetchApifyPlaces({ categories: [...TARGET], maxPerQuery: 20 });
    console.log(`apify: ${raw.length} rows`);
    if (!raw.length) return [];
    const merged = mergePlaces(raw);
    return await geocodeMissingCoordinates(merged);
  } catch (error) {
    console.warn(`apify: dilewati (${(error as Error).message})`);
    return [];
  }
}

async function collectGosomCsvs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".csv")) files.push(full);
    if (entry.isDirectory()) {
      const sub = await readdir(full, { withFileTypes: true }).catch(() => []);
      for (const s of sub) {
        if (s.isFile() && s.name.toLowerCase().endsWith(".csv")) files.push(path.join(full, s.name));
      }
    }
  }
  return files;
}

async function loadGosom(workingDir: string): Promise<CanonicalPlace[]> {
  try {
    const csvs = await collectGosomCsvs(workingDir);
    if (!csvs.length) {
      console.warn(`gosom: tidak ada CSV di ${workingDir}, dilewati`);
      return [];
    }
    const raw: RawPlace[] = [];
    for (const file of csvs) {
      const hint = `${path.basename(path.dirname(file)).toLowerCase()} ${path.basename(file).toLowerCase()}`;
      const category = [...TARGET].find((c) => hint.includes(c)) ?? "alam";
      const content = await readFile(file, "utf8");
      raw.push(...parseGosomResults(content, "csv", [category]));
    }
    console.log(`gosom: ${raw.length} rows dari ${csvs.length} file`);
    const merged = mergePlaces(raw);
    return await geocodeMissingCoordinates(merged);
  } catch (error) {
    console.warn(`gosom: dilewati (${(error as Error).message})`);
    return [];
  }
}

function summarize(places: CanonicalPlace[]) {
  const byCategory = new Map<string, number>();
  const byProvider = new Map<string, number>();
  for (const p of places) {
    const provider = String((p.details as Record<string, unknown> | undefined)?.provider ?? p.source);
    byProvider.set(provider, (byProvider.get(provider) ?? 0) + 1);
    for (const slug of p.categorySlugs) byCategory.set(slug, (byCategory.get(slug) ?? 0) + 1);
  }
  return {
    total: places.length,
    byCategory: Object.fromEntries([...byCategory.entries()].sort()),
    byProvider: Object.fromEntries([...byProvider.entries()].sort()),
  };
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const apiRoot = path.resolve(here, "../..");
  const outJson = path.join(apiRoot, "prisma", "seed-data", "destinations.padang.review.json");
  const outHtml = path.join(apiRoot, "prisma", "seed-data", "destinations.padang.review.html");
  const gosomDir =
    process.env.GOSOM_OUT_DIR ??
    path.join(process.env.TEMP ?? "C:\\Users\\Gybran\\AppData\\Local\\Temp\\opencode", "gosom-padang");

  await mkdir(path.dirname(outJson), { recursive: true });

  const repo = await runRepoScrape().catch((e) => {
    console.warn(`repo: dilewati (${(e as Error).message})`);
    return [] as CanonicalPlace[];
  });
  const apify = await runApify().catch((e) => {
    console.warn(`apify: dilewati (${(e as Error).message})`);
    return [] as CanonicalPlace[];
  });
  const gosom = await loadGosom(gosomDir).catch((e) => {
    console.warn(`gosom: dilewati (${(e as Error).message})`);
    return [] as CanonicalPlace[];
  });

  const merged = mergeCanonicalByName([repo, apify, gosom]);
  const filtered = filterTarget(merged);
  const seedFile = buildSeedFile(
    filtered,
    new Date().toISOString(),
    "Padang destinations review (repo + apify + gosom)",
  );
  await writeReviewFiles(outJson, outHtml, seedFile);

  const summary = summarize(filtered);
  console.log(JSON.stringify({ outJson, outHtml, gosomDir, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

