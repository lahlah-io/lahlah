import { env } from "../../../env.js";
import type { RawPlace } from "../types.js";

const BASE_URL = "https://overpass-api.de/api/interpreter";
// Kota Padang approx bbox (south,west,north,east)
const BBOX = "-1.06,100.30,-0.84,100.46";

const QUERY = `[out:json][timeout:90];(
node["tourism"~"^(attraction|museum|viewpoint|gallery|theme_park|zoo)$"](${BBOX});
way["tourism"~"^(attraction|museum|viewpoint|gallery|theme_park|zoo)$"](${BBOX});
node["natural"~"^(beach|waterfall|peak|cave_entrance)$"](${BBOX});
way["natural"~"^(beach|waterfall|peak|cave_entrance)$"](${BBOX});
node["leisure"~"^(park|garden|nature_reserve|beach_resort)$"](${BBOX});
way["leisure"~"^(park|garden|nature_reserve|beach_resort)$"](${BBOX});
node["historic"](${BBOX});
way["historic"](${BBOX});
node["amenity"~"^(restaurant|cafe)$"](${BBOX});
node["shop"~"^(mall|supermarket)$"](${BBOX});
way["shop"~"^(mall|supermarket)$"](${BBOX});
);out center tags 800;`;

type OverpassElement = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

export function rawCategoryTags(tags: Record<string, string>): string[] {
  const output: string[] = [];
  if (tags.tourism) output.push(`tourism=${tags.tourism}`);
  if (tags.natural) output.push(`natural=${tags.natural}`);
  if (tags.leisure) output.push(`leisure=${tags.leisure}`);
  if (tags.amenity) output.push(`amenity=${tags.amenity}`);
  if (tags.shop) output.push(`shop=${tags.shop}`);
  if (tags.historic) output.push("historic=*");
  return output;
}

export function parseOverpassElements(elements: unknown[]): RawPlace[] {
  return (elements as OverpassElement[]).flatMap((element) => {
    const tags = element?.tags ?? {};
    if (!element?.type || element.id === undefined || !tags.name) return [];

    return [
      {
        source: "overpass" as const,
        sourcePlaceId: `${element.type}/${element.id}`,
        name: tags.name,
        description: tags.description ?? null,
        address: tags["addr:street"] ?? null,
        latitude: element.lat ?? element.center?.lat ?? null,
        longitude: element.lon ?? element.center?.lon ?? null,
        imageUrl: null,
        rawCategories: rawCategoryTags(tags),
        details: { provider: "overpass", tags },
      },
    ];
  });
}

export async function fetchOverpass(): Promise<RawPlace[]> {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": env.SCRAPE_USER_AGENT,
    },
    body: new URLSearchParams({ data: QUERY }),
  });
  if (!response.ok) throw new Error(`Overpass ${response.status}`);

  const body = (await response.json()) as { elements?: unknown[] };
  return parseOverpassElements(body.elements ?? []);
}
