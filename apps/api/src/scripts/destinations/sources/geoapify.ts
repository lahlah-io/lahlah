import { env } from "../../../env.js";
import { normalizeName } from "../normalize.js";
import type { PlaceSource, RawPlace } from "../types.js";

const BASE_URL = "https://api.geoapify.com";
const PADANG = { lat: -0.9471, lon: 100.4172 };
const CATEGORIES = [
  "beach",
  "natural",
  "leisure.park",
  "leisure.spa",
  "tourism.sights",
  "tourism.attraction",
  "entertainment.museum",
  "entertainment.culture",
  "catering.restaurant",
  "catering.cafe",
  "catering.fast_food",
  "commercial.shopping_mall",
  "commercial.supermarket",
  "commercial.marketplace",
  "heritage.unesco",
  "religion.place_of_worship",
];

type GeoapifyFeature = {
  properties?: {
    place_id?: string;
    name?: string;
    address_line2?: string;
    lat?: number;
    lon?: number;
    categories?: string[];
  } | null;
};

export function parseGeoapifyPlaces(features: unknown[]): RawPlace[] {
  return (features as GeoapifyFeature[]).flatMap((feature) => {
    const properties = feature?.properties;
    if (!properties?.place_id || !properties.name) return [];

    return [
      {
        source: "geoapify" as const,
        sourcePlaceId: properties.place_id,
        name: properties.name,
        description: null,
        address: properties.address_line2 ?? null,
        latitude: properties.lat ?? null,
        longitude: properties.lon ?? null,
        imageUrl: null,
        rawCategories: properties.categories ?? [],
        details: { provider: "geoapify" },
      },
    ];
  });
}

export async function fetchGeoapify(): Promise<RawPlace[]> {
  if (!env.GEOAPIFY_API_KEY) return [];

  const params = new URLSearchParams({
    categories: CATEGORIES.join(","),
    // rect filter: minLon,minLat,maxLon,maxLat (Kota Padang approx bbox)
    filter: "rect:100.30,-1.06,100.46,-0.84",
    limit: String(env.SCRAPE_LIMIT),
    apiKey: env.GEOAPIFY_API_KEY,
  });

  const response = await fetch(`${BASE_URL}/v2/places?${params}`);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Geoapify ${response.status}${text ? `: ${text.slice(0, 120)}` : ""}`);
  }

  const body = (await response.json()) as { features?: unknown[] };
  return parseGeoapifyPlaces(body.features ?? []);
}

// Manual entries arrive without coordinates. Geocoding fills them, never creates rows.
export async function geocodeMissingCoordinates<
  T extends { name: string; source: PlaceSource; latitude: number | null; longitude: number | null },
>(places: T[]): Promise<T[]> {
  if (!env.GEOAPIFY_API_KEY) return places;

  const pending = places
    .filter((place) => place.latitude === null && place.source === "manual")
    .slice(0, 20);
  const coordinates = new Map<string, { lat: number; lon: number }>();

  for (const place of pending) {
    const params = new URLSearchParams({
      text: `${place.name}, ${env.SCRAPE_CITY}`,
      filter: "countrycode:id",
      limit: "1",
      apiKey: env.GEOAPIFY_API_KEY,
    });

    try {
      const response = await fetch(`${BASE_URL}/v1/geocode/search?${params}`);
      if (!response.ok) continue;
      const body = (await response.json()) as {
        features?: Array<{ properties?: { lat?: number; lon?: number } }>;
      };
      const point = body.features?.[0]?.properties;
      if (point?.lat !== undefined && point.lon !== undefined) {
        coordinates.set(normalizeName(place.name), { lat: point.lat, lon: point.lon });
      }
    } catch {
      continue;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return places.map((place) => {
    const point = coordinates.get(normalizeName(place.name));
    return point ? { ...place, latitude: point.lat, longitude: point.lon } : place;
  });
}
