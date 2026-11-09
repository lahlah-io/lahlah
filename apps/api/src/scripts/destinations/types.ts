export type PlaceSource = "geoapify" | "firecrawl" | "overpass" | "wikidata" | "manual";

export type RawPlace = {
  source: PlaceSource;
  sourcePlaceId: string;
  name: string;
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  rawCategories: string[];
  details: Record<string, unknown>;
};

export type CanonicalPlace = {
  canonicalKey: string;
  source: PlaceSource;
  sourcePlaceId: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  categorySlugs: string[];
  details: Record<string, unknown>;
};
