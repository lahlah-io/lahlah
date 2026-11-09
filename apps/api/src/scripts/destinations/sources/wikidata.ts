import { env } from "../../../env.js";
import type { RawPlace } from "../types.js";

const ENDPOINT = "https://query.wikidata.org/sparql";
const PADANG_QID = "Q7253";

const QUERY = `SELECT DISTINCT ?item ?itemLabel ?itemDescription ?coord ?typeLabel ?image WHERE {
  ?item wdt:P131* wd:${PADANG_QID} .
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item wdt:P31 ?type }
  OPTIONAL { ?item wdt:P18 ?image }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "id,en". }
} LIMIT 1500`;

const TYPE_KEYWORDS: Array<[string, string]> = [
  ["pantai", "natural=beach"],
  ["beach", "natural=beach"],
  ["museum", "tourism=museum"],
  ["masjid", "tourism=attraction"],
  ["mosque", "tourism=attraction"],
  ["pasar", "shop=mall"],
  ["market", "shop=mall"],
  ["taman", "leisure=park"],
  ["park", "leisure=park"],
];

type Binding = {
  item?: { value?: string };
  itemLabel?: { value?: string };
  itemDescription?: { value?: string };
  coord?: { value?: string };
  typeLabel?: { value?: string };
  image?: { value?: string };
};

function parsePoint(value: string | undefined): { lat: number; lon: number } | null {
  const match = value?.match(/^Point\(([-\d.]+) ([-\d.]+)\)$/);
  if (!match) return null;
  return { lon: Number(match[1]), lat: Number(match[2]) };
}

export function parseWikidataBindings(bindings: unknown[]): RawPlace[] {
  return (bindings as Binding[]).flatMap((binding) => {
    const name = binding.itemLabel?.value?.trim();
    if (!binding.item?.value || !name) return [];
    if (name.startsWith("Daftar ") || name.startsWith("List of ") || /^Q\d+$/.test(name)) return [];
    const desc = (binding.itemDescription?.value ?? "").toLowerCase();
    if (desc.includes("halaman daftar") || desc.includes("disambiguation") || desc.includes("wikimedia")) return [];

    const point = parsePoint(binding.coord?.value);
    const type = binding.typeLabel?.value?.toLowerCase() ?? "";
    const rawCategories = TYPE_KEYWORDS.filter(([keyword]) => type.includes(keyword)).map(
      ([, tag]) => tag,
    );

    return [
      {
        source: "wikidata" as const,
        sourcePlaceId: binding.item.value.split("/").pop() ?? binding.item.value,
        name,
        description: binding.itemDescription?.value ?? null,
        address: null,
        latitude: point?.lat ?? null,
        longitude: point?.lon ?? null,
        imageUrl: binding.image?.value ?? null,
        rawCategories,
        details: { provider: "wikidata" },
      },
    ];
  });
}

export async function fetchWikidata(): Promise<RawPlace[]> {
  const params = new URLSearchParams({ query: QUERY, format: "json" });
  const response = await fetch(`${ENDPOINT}?${params}`, {
    headers: {
      accept: "application/sparql-results+json",
      "user-agent": env.SCRAPE_USER_AGENT,
    },
  });
  if (!response.ok) throw new Error(`Wikidata ${response.status}`);

  const body = (await response.json()) as {
    results?: { bindings?: unknown[] };
  };
  return parseWikidataBindings(body.results?.bindings ?? []);
}
