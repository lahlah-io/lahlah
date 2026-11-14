import { resolveCategories } from "./categories.js";
import type { CanonicalPlace, PlaceSource, RawPlace } from "./types.js";

export const SOURCE_PRIORITY: PlaceSource[] = [
  "geoapify",
  "firecrawl",
  "overpass",
  "wikidata",
  "manual",
];

export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(objek wisata|wisata|kawasan)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isTokenSubset(a: string, b: string): boolean {
  const left = new Set(a.split(" "));
  const right = new Set(b.split(" "));
  const [small, big] = left.size <= right.size ? [left, right] : [right, left];
  return [...small].every((token) => big.has(token));
}

const PADANG_BBOX = { minLat: -1.06, maxLat: -0.84, minLon: 100.3, maxLon: 100.46 };
const OTHER_REGIONS = [
  "pariaman",
  "agam",
  "solok",
  "bukittinggi",
  "payakumbuh",
  "pasaman",
  "sijunjung",
  "dharmasraya",
  "mentawai",
  "tanah datar",
  "padang panjang",
  "sawahlunto",
  "pesisir selatan",
  "padang pariaman",
];

function isInPadang(lat: number | null, lon: number | null): boolean {
  if (lat == null || lon == null) return true; // keep; provenance/curation can refine
  return lat >= PADANG_BBOX.minLat && lat <= PADANG_BBOX.maxLat && lon >= PADANG_BBOX.minLon && lon <= PADANG_BBOX.maxLon;
}

// Exclude schools/education and government institutions (destinations should be places to visit).
// "MAS/MIN" only in clear school-name patterns (avoid dropping POIs like "Mas Pepen").
const EXCLUDED_NAME =
  /\b(sd(n| negeri| swasta)?\b|smp(n| negeri| swasta)?\b|sma(n| negeri| swasta)?\b|smk(n| negeri| swasta)?\b|slb\b|sekolah\b|madrasah\b|mas\s+(al\b|darul|ti\b|dr\b|h\b|nur|an\b|muhammadiyah|terpadu|plus|unggul|[a-z]{2,})|\bmin\s+\d|\bmi\s+(negeri|swasta|\d)|\bmts(n| negeri| swasta)?\b|\bmti\b|\bman\s+\d|\btk\b|paud\b|\bkb\b|taman kanak|\bra\b|raudhatul|pesantren|pondok pesantren|universitas\b|akademi\b|institut\b|politeknik\b|sekolah tinggi\b|stkip\b|stie\b|stikes\b|stmik\b|amik\b|kampus\b|fakultas\b|dinas\b|kantor\s+(camat|lurah|walikota|wali kota|gubernur|bupati|pemerintah|imigrasi|pajak|bea cukai|pertanahan|agraria|kesehatan|pendidikan|sosial|kepolisian|polisi|polsek|polres|polda|pemadam|damkar|kejaksaan|pengadilan|kemenag|kementerian|kpu|bawaslu|bpbd|bappeda|bpkad|bps|dukcapil|pos\b|perwakilan|kedutaan|statistik|arsip|perhubungan|perdagangan|pu\b|pupr|lingkungan|pariwisata)|balai\s+kota\b|pemerintah\s+(kota|provinsi|daerah|kabupaten)\b|pemko\b|pemprov\b|dprd\b|dpd\b|komisi\s+[ivx]+\b|kodim\b|koramil\b|korem\b|markas\b|lanud\b|polres\b|polsek\b|kejaksaan\b|pengadilan\b|rumah\s+tahanan\b|rutan\b|lapas\b)\b/i;
const EXCLUDED_DESC =
  /\b(perguruan tinggi|higher education institution|sekolah (dasar|menengah|tinggi|kejuruan)|government (office|agency|institution|building)|instansi pemerintah|kantor pemerintahan|lembaga pemerintahan)\b/i;

// Places of worship and monuments are not trip destinations for this app.
const EXCLUDED_NAME_WORSHIP =
  /\b(masjid|mushalla|mushollah|mushola|musholah|musala|musalla|surau|langgar|gereja|vihara|wihara|pura|klenteng|kelenteng|gurdwara|kuil|tugu|monumen)\b/i;

function isExcludedInstitution(item: RawPlace): boolean {
  const name = (item.name ?? "").toLowerCase();
  if (EXCLUDED_NAME.test(name) || EXCLUDED_NAME_WORSHIP.test(name)) return true;
  // Use description only for strong institutional signals to avoid dropping mis-tagged POIs.
  const desc = (item.description ?? "").toLowerCase();
  if (EXCLUDED_DESC.test(desc) && !/\b(pantai|museum|taman wisata|masjid raya|gereja|vihara|pura|monumen|benteng|pantai|danau|air terjun|gunung|bukit|kawasan wisata|objek wisata)\b/.test(name)) {
    return true;
  }
  return false;
}

function isPadangOnly(item: RawPlace): boolean {
  if (!isInPadang(item.latitude, item.longitude)) return false;
  const addr = (item.address ?? "").toLowerCase();
  const desc = (item.description ?? "").toLowerCase();
  const hay = `${addr} ${desc}`;
  const mentionsPadang = /\bkota padang\b|\bpadang\b/.test(hay);
  const mentionsOther = OTHER_REGIONS.some((r) => hay.includes(r));
  if (mentionsOther && !mentionsPadang) return false;
  if (addr && OTHER_REGIONS.some((r) => addr.includes(r)) && !/\bkota padang\b|\bpadang\s*,/.test(addr)) return false;
  return true;
}

export function mergePlaces(places: RawPlace[]): CanonicalPlace[] {
  const groups = new Map<string, RawPlace[]>();

  for (const item of places) {
    if (!isPadangOnly(item) || isExcludedInstitution(item)) continue;
    const key = normalizeName(item.name);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.entries()].map(([canonicalKey, items]) => {
    const ordered = [...items].sort(
      (a, b) => SOURCE_PRIORITY.indexOf(a.source) - SOURCE_PRIORITY.indexOf(b.source),
    );
    const winner = ordered[0] as RawPlace;

    return {
      canonicalKey,
      source: winner.source,
      sourcePlaceId: winner.sourcePlaceId,
      name: winner.name,
      description: ordered.find((p) => p.description)?.description ?? null,
      address: ordered.find((p) => p.address)?.address ?? null,
      city: "Padang",
      latitude: ordered.find((p) => p.latitude !== null)?.latitude ?? null,
      longitude: ordered.find((p) => p.longitude !== null)?.longitude ?? null,
      imageUrl: ordered.find((p) => p.imageUrl)?.imageUrl ?? null,
      categorySlugs: [...new Set(ordered.flatMap((p) => resolveCategories(p.rawCategories)))],
      details: {
        primarySource: winner.source,
        mergedSources: ordered.map((p) => ({ source: p.source, sourcePlaceId: p.sourcePlaceId })),
      },
    };
  });
}
