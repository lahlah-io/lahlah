import { env } from "../../../env.js";
import type { RawPlace } from "../types.js";

const ACTOR_ID = "compass~crawler-google-places";
const BASE_URL = "https://api.apify.com/v2";
const CATEGORY_QUERIES: Record<string, string[]> = {
  alam: ["tempat wisata alam Padang Sumatera Barat"],
  kuliner: ["kuliner Padang Sumatera Barat", "rumah makan Padang Sumatera Barat"],
  budaya: ["wisata budaya Padang Sumatera Barat"],
  keluarga: ["wisata keluarga Padang Sumatera Barat"],
  belanja: ["tempat belanja Padang Sumatera Barat"],
  santai: ["tempat santai Padang Sumatera Barat"],
  sejarah: ["wisata sejarah Padang Sumatera Barat"],
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function shortDescription(item: Record<string, unknown>): string | null {
  const raw =
    asString(item.description) ??
    asString(item.subTitle) ??
    asString(item.categoryName) ??
    asString(item.title) ??
    null;
  if (!raw) return null;
  const firstSentence = raw.split(/(?<=[.!?])\s+/)[0] ?? raw;
  const text = firstSentence.trim();
  return text.length > 180 ? `${text.slice(0, 177).trimEnd()}...` : text;
}

function pickImage(item: Record<string, unknown>): string | null {
  const direct = asString(item.imageUrl) ?? asString(item.image);
  if (direct) return direct;
  const images = item.imageUrls;
  if (Array.isArray(images)) {
    for (const img of images) {
      const s = asString(img);
      if (s) return s;
    }
  }
  return null;
}

export function inferApifyCategorySlugs(item: Record<string, unknown>): string[] {
  const hints: string[] = [];
  const add = (v: unknown) => {
    const s = asString(v);
    if (s) hints.push(s.toLowerCase());
  };
  add(item.categoryName);
  add(item.subTitle);
  const cats = item.categories;
  if (Array.isArray(cats)) for (const c of cats) add(c);
  const joined = hints.join(" ");
  const slugs = new Set<string>();
  if (/beach|pantai/.test(joined)) { slugs.add("pantai"); slugs.add("alam"); }
  if (/park|garden|nature|alam|gunung|bukit|air terjun|danau|hutan/.test(joined)) slugs.add("alam");
  if (/restaurant|food|cafe|coffee|kuliner|makan|bakery/.test(joined)) slugs.add("kuliner");
  if (/museum|culture|budaya|art|gallery|heritage/.test(joined)) slugs.add("budaya");
  if (/family|kids|playground|zoo|keluarga|taman bermain/.test(joined)) slugs.add("keluarga");
  if (/market|mall|shop|store|belanja|souvenir/.test(joined)) slugs.add("belanja");
  if (/spa|relax|santai|resort|lounge/.test(joined)) slugs.add("santai");
  if (/history|histor|sejarah|monument area|fort|benteng/.test(joined)) slugs.add("sejarah");
  return [...slugs];
}

export function mapApifyItemToRaw(
  item: unknown,
  inferredCategorySlugs: string[] = [],
): RawPlace | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const name = asString(record.title) ?? asString(record.name);
  if (!name) return null;

  const location = (record.location && typeof record.location === "object"
    ? (record.location as Record<string, unknown>)
    : null);
  const latitude = asNumber(location?.lat) ?? asNumber(record.latitude);
  const longitude = asNumber(location?.lng) ?? asNumber(record.longitude) ?? asNumber(location?.lon);
  if (latitude === null || longitude === null) return null;

  const placeId =
    asString(record.placeId) ??
    asString(record.id) ??
    asString(record.url) ??
    asString(record.cid);
  const sourcePlaceId = placeId ?? `apify:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const address = asString(record.address) ?? asString(record.street);
  const city = asString(record.city) ?? "Padang";
  const rawCategories = [
    ...new Set([
      ...inferredCategorySlugs,
      ...inferApifyCategorySlugs(record),
      ...((Array.isArray(record.categories) ? record.categories : [])
        .map((c) => asString(c))
        .filter((c): c is string => Boolean(c))),
      ...(asString(record.categoryName) ? [asString(record.categoryName)!] : []),
    ]),
  ];

  return {
    source: "manual",
    sourcePlaceId,
    name,
    description: shortDescription(record),
    address,
    latitude,
    longitude,
    imageUrl: pickImage(record),
    rawCategories,
    details: {
      provider: "apify",
      apifyPlaceId: placeId,
      city,
      url: asString(record.url),
      categoryName: asString(record.categoryName),
    },
  };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function runApifyActor(token: string, searchStringsArray: string[], maxCrawledPlaces: number) {
  const body = {
    searchStringsArray,
    language: "id",
    maxCrawledPlaces,
    maxCrawledPlacesPerSearch: maxCrawledPlaces,
    skipClosedPlaces: false,
  };
  const res = await fetch(`${BASE_URL}/acts/${ACTOR_ID}/runs?token=${encodeURIComponent(token)}&waitForFinish=120`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Apify run failed: ${res.status}`);
  const json = (await res.json()) as { data?: { defaultDatasetId?: string; status?: string; id?: string } };
  let datasetId = json.data?.defaultDatasetId;
  let status = json.data?.status;
  const runId = json.data?.id;
  if (!datasetId && runId) {
    for (let i = 0; i < 30 && !datasetId; i += 1) {
      await sleep(2000);
      const poll = await fetch(`${BASE_URL}/actor-runs/${runId}?token=${encodeURIComponent(token)}`);
      if (!poll.ok) break;
      const p = (await poll.json()) as { data?: { defaultDatasetId?: string; status?: string } };
      datasetId = p.data?.defaultDatasetId;
      status = p.data?.status;
      if (status && /SUCCEEDED|FAILED|ABORTED|TIMED-OUT/.test(status) && datasetId) break;
    }
  }
  if (!datasetId) throw new Error("Apify dataset not available");
  const itemsRes = await fetch(`${BASE_URL}/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&clean=true`);
  if (!itemsRes.ok) throw new Error(`Apify dataset fetch failed: ${itemsRes.status}`);
  return (await itemsRes.json()) as unknown[];
}

export async function fetchApifyPlaces(opts?: {
  token?: string;
  categories?: string[];
  maxPerQuery?: number;
}): Promise<RawPlace[]> {
  const token = (opts?.token ?? env.APIFY_TOKEN ?? "").trim();
  if (!token) {
    console.warn("APIFY_TOKEN kosong, sumber apify dilewati");
    return [];
  }
  const categories = opts?.categories ?? Object.keys(CATEGORY_QUERIES);
  const maxPerQuery = opts?.maxPerQuery ?? 20;
  const out: RawPlace[] = [];
  const seen = new Set<string>();

  for (const slug of categories) {
    const queries = CATEGORY_QUERIES[slug] ?? [`${slug} Padang Sumatera Barat`];
    try {
      const items = await runApifyActor(token, queries, maxPerQuery);
      for (const item of items) {
        const mapped = mapApifyItemToRaw(item, [slug]);
        if (!mapped) continue;
        const key = `${mapped.name.toLowerCase()}|${mapped.latitude}|${mapped.longitude}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(mapped);
      }
    } catch (error) {
      console.warn(`apify ${slug}: ${(error as Error).message}`);
    }
  }
  return out;
}
