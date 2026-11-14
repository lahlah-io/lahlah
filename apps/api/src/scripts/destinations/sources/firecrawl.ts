import { env } from "../../../env.js";
import { normalizeName } from "../normalize.js";
import type { RawPlace } from "../types.js";

const BASE_URL = "https://api.firecrawl.dev/v2";
const MAX_SEARCH_RESULTS = 5;
const MAX_SCRAPES = 10;

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    places: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          address: { type: "string" },
          categories: { type: "array", items: { type: "string" } },
        },
        required: ["name"],
      },
    },
  },
  required: ["places"],
};

async function post(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Firecrawl ${response.status}${text ? `: ${text.slice(0, 120)}` : ""}`);
  }
  return response.json();
}

export function extractSearchUrls(body: unknown): string[] {
  const data = (body as { data?: unknown } | null)?.data;
  const items = Array.isArray(data)
    ? data
    : ((data as { web?: unknown } | undefined)?.web as unknown[] | undefined) ?? [];

  return (items as Array<{ url?: unknown }>)
    .map((item) => item?.url)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
}

export function parseFirecrawlPlaces(body: unknown): RawPlace[] {
  const places = (body as { data?: { json?: { places?: unknown } } } | null)?.data?.json?.places;
  if (!Array.isArray(places)) return [];

  return places.flatMap((raw) => {
    const item = raw as {
      name?: unknown;
      description?: unknown;
      address?: unknown;
      categories?: unknown;
    };
    if (typeof item.name !== "string" || item.name.trim().length === 0) return [];

    return [
      {
        source: "firecrawl" as const,
        sourcePlaceId: normalizeName(item.name).replace(/\s+/g, "-"),
        name: item.name.trim(),
        description: typeof item.description === "string" ? item.description : null,
        address: typeof item.address === "string" ? item.address : null,
        latitude: null,
        longitude: null,
        imageUrl: null,
        rawCategories: Array.isArray(item.categories)
          ? item.categories.filter((value): value is string => typeof value === "string")
          : [],
        details: { provider: "firecrawl" },
      },
    ];
  });
}

export async function fetchFirecrawl(): Promise<RawPlace[]> {
  if (!env.FIRECRAWL_API_KEY) return [];

  const queries = [
    `tempat wisata di ${env.SCRAPE_CITY} Sumatera Barat`,
    `pantai dan alam ${env.SCRAPE_CITY}`,
    `kuliner terkenal ${env.SCRAPE_CITY}`,
    `museum sejarah budaya ${env.SCRAPE_CITY}`,
  ];
  const urls = new Set<string>();
  for (const query of queries) {
    try {
      const search = await post("/search", {
        query,
        limit: MAX_SEARCH_RESULTS,
        sources: [{ type: "web" }],
      });
      for (const url of extractSearchUrls(search)) urls.add(url);
    } catch {
      // Lanjut ke query berikutnya saat pencarian gagal.
    }
  }
  const urlList = [...urls].slice(0, MAX_SCRAPES);

  const places: RawPlace[] = [];

  for (const url of urlList) {
    try {
      const scraped = await post("/scrape", {
        url,
        formats: [
          {
            type: "json",
            prompt: `Ambil hanya destinasi wisata yang benar-benar berada di Kota ${env.SCRAPE_CITY}.`,
            schema: EXTRACT_SCHEMA,
          },
        ],
      });
      places.push(...parseFirecrawlPlaces(scraped));
    } catch {
      // Lewati halaman yang gagal di-scrape.
    }
  }

  return places;
}
