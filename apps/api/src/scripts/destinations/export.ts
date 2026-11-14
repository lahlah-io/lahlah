import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CATEGORY_NAMES } from "./categories.js";
import type { CanonicalPlace } from "./types.js";

export type SeedDestination = {
  canonicalKey: string;
  name: string;
  description: string | null;
  latitude: string | null;
  longitude: string | null;
  address: string | null;
  city: string;
  source: string;
  sourcePlaceId: string;
  isActive: boolean;
  imageUrl: string | null;
  details: Record<string, unknown>;
  categorySlugs: string[];
};

export type SeedFile = {
  exportedAt: string;
  scope: string;
  categories: { slug: string; name: string }[];
  destinations: SeedDestination[];
};

const TARGET_CATEGORY_SLUGS = [
  "alam",
  "kuliner",
  "budaya",
  "keluarga",
  "belanja",
  "santai",
  "sejarah",
  "pantai",
] as const;

function coordToString(value: number | null): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

export function toSeedDestination(place: CanonicalPlace): SeedDestination {
  return {
    canonicalKey: place.canonicalKey,
    name: place.name,
    description: place.description ?? null,
    latitude: coordToString(place.latitude),
    longitude: coordToString(place.longitude),
    address: place.address ?? null,
    city: place.city,
    source: place.source,
    sourcePlaceId: place.sourcePlaceId,
    isActive: true,
    imageUrl: place.imageUrl ?? null,
    details: place.details ?? {},
    categorySlugs: [...new Set(place.categorySlugs)],
  };
}

function categoriesForDestinations(destinations: SeedDestination[]) {
  const slugs = new Set<string>(TARGET_CATEGORY_SLUGS);
  for (const d of destinations) for (const s of d.categorySlugs) slugs.add(s);
  return [...slugs]
    .filter((slug) => slug in CATEGORY_NAMES)
    .sort()
    .map((slug) => ({ slug, name: CATEGORY_NAMES[slug]! }));
}

export function buildSeedFile(
  places: CanonicalPlace[],
  exportedAt: string,
  scope: string,
): SeedFile {
  const destinations = places.map(toSeedDestination);
  return {
    exportedAt,
    scope,
    categories: categoriesForDestinations(destinations),
    destinations,
  };
}

export function buildExportSeedFile(
  places: CanonicalPlace[],
  scope = "Padang destinations export",
  exportedAt = new Date().toISOString(),
): SeedFile {
  return buildSeedFile(places, exportedAt, scope);
}

export type ScrapeArgs = {
  dryRun: boolean;
  source: string | null;
  exportPath: string | null;
  htmlPath: string | null;
};

function flagValue(argv: string[], names: string[]): string | null {
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]!;
    for (const name of names) {
      if (arg === name) return argv[i + 1] ?? null;
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
    }
  }
  return null;
}

export function parseScrapeArgs(argv: string[]): ScrapeArgs {
  const exportPath = flagValue(argv, ["--export", "--out"]);
  let htmlPath = flagValue(argv, ["--html"]);
  if (exportPath && !htmlPath) {
    htmlPath = exportPath.replace(/\.json$/i, "") + ".html";
  }
  return {
    dryRun: argv.includes("--dry-run"),
    source: flagValue(argv, ["--source"]),
    exportPath,
    htmlPath,
  };
}

function mergeKey(place: CanonicalPlace): string {
  return place.canonicalKey || place.name.trim().toLowerCase();
}

function unionMergedSources(a: unknown, b: unknown): unknown[] {
  const arr = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])];
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const item of arr) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function mergeTwo(base: CanonicalPlace, next: CanonicalPlace): CanonicalPlace {
  const details: Record<string, unknown> = { ...base.details, ...next.details };
  const mergedSources = unionMergedSources(
    (base.details as any)?.mergedSources,
    (next.details as any)?.mergedSources,
  );
  if (mergedSources.length) details.mergedSources = mergedSources;
  return {
    ...base,
    source: base.source,
    sourcePlaceId: base.sourcePlaceId || next.sourcePlaceId,
    name: base.name || next.name,
    description: base.description ?? next.description ?? null,
    address: base.address ?? next.address ?? null,
    city: base.city || next.city,
    latitude: base.latitude ?? next.latitude ?? null,
    longitude: base.longitude ?? next.longitude ?? null,
    imageUrl: base.imageUrl ?? next.imageUrl ?? null,
    categorySlugs: [...new Set([...base.categorySlugs, ...next.categorySlugs])],
    details,
    canonicalKey: base.canonicalKey || next.canonicalKey,
  };
}

export function mergeCanonicalByName(sets: CanonicalPlace[][]): CanonicalPlace[] {
  const map = new Map<string, CanonicalPlace>();
  for (const set of sets) {
    for (const place of set) {
      const key = mergeKey(place);
      const existing = map.get(key);
      map.set(key, existing ? mergeTwo(existing, place) : { ...place });
    }
  }
  return [...map.values()];
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderReviewHtml(seedFile: SeedFile): string {
  const dataJson = JSON.stringify(seedFile).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Destination Review</title>
<style>
body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:16px;}
table{border-collapse:collapse;width:100%;font-size:13px;}
th,td{border:1px solid #ccc;padding:6px 8px;vertical-align:top;}
th{background:#f5f5f5;position:sticky;top:0;}
.controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;}
input[type=text]{padding:6px;min-width:260px;}
button{padding:6px 10px;cursor:pointer;}
.count{font-weight:600;}
</style>
</head>
<body>
<h1>Destination Review</h1>
<div class="controls">
  <span class="count">Total: <span id="count">0</span></span>
  <input id="search" type="text" placeholder="Search name/category/address" />
  <button id="download">Download / Unduh edited JSON</button>
</div>
<table>
  <thead><tr><th>#</th><th>Name</th><th>Categories</th><th>Description</th><th>Address</th><th>Lat</th><th>Lng</th><th>Source</th><th>Action</th></tr></thead>
  <tbody id="tbody"></tbody>
</table>
<script>
const seed = ${dataJson};
let rows = (seed.destinations || []).slice();
const tbody = document.getElementById('tbody');
const countEl = document.getElementById('count');
const searchEl = document.getElementById('search');
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function visibleRows(){
  const q = (searchEl.value||'').toLowerCase().trim();
  if(!q) return rows.map((r,i)=>({r,i}));
  return rows.map((r,i)=>({r,i})).filter(({r})=>[r.name,(r.categorySlugs||[]).join(','),r.address,r.description].join(' ').toLowerCase().includes(q));
}
function render(){
  const vis = visibleRows();
  countEl.textContent = rows.length + ' (shown ' + vis.length + ')';
  tbody.innerHTML = vis.map(({r,i},idx)=>'<tr>'+
    '<td>'+ (idx+1) +'</td>'+
    '<td>'+esc(r.name)+'</td>'+
    '<td>'+esc((r.categorySlugs||[]).join(', '))+'</td>'+
    '<td>'+esc(r.description)+'</td>'+
    '<td>'+esc(r.address)+'</td>'+
    '<td>'+esc(r.latitude)+'</td>'+
    '<td>'+esc(r.longitude)+'</td>'+
    '<td>'+esc(r.source)+'</td>'+
    '<td><button data-i="'+i+'">Delete / Hapus</button></td>'+
  '</tr>').join('');
}
tbody.addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-i]');
  if(!btn) return;
  const i = Number(btn.getAttribute('data-i'));
  rows.splice(i,1);
  render();
});
searchEl.addEventListener('input', render);
document.getElementById('download').addEventListener('click', ()=>{
  const out = { ...seed, destinations: rows };
  const blob = new Blob([JSON.stringify(out, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'destinations.padang.review.edited.json';
  a.click();
  URL.revokeObjectURL(a.href);
});
render();
</script>
</body>
</html>`;
}

export async function writeSeedFile(filePath: string, data: SeedFile): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function writeReviewFiles(
  jsonPath: string,
  htmlPath: string,
  seedFile: SeedFile,
): Promise<void> {
  await writeSeedFile(jsonPath, seedFile);
  await mkdir(path.dirname(htmlPath), { recursive: true });
  await writeFile(htmlPath, renderReviewHtml(seedFile), "utf8");
}
