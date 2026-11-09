const CATEGORY_MAP: Record<string, string[]> = {
  "natural.beach": ["pantai", "alam", "santai"],
  natural: ["alam"],
  "leisure.park": ["alam", "keluarga", "santai"],
  "tourism.sights": ["budaya"],
  "tourism.museum": ["sejarah", "budaya"],
  "entertainment.museum": ["sejarah", "budaya"],
  "catering.restaurant": ["kuliner"],
  "catering.cafe": ["kuliner", "santai"],
  "shopping.mall": ["belanja"],
  heritage: ["sejarah", "budaya"],
  "amenity=restaurant": ["kuliner"],
  "amenity=cafe": ["kuliner", "santai"],
  "natural=beach": ["pantai", "alam", "santai"],
  "leisure=park": ["alam", "keluarga"],
  "tourism=attraction": ["budaya"],
  "tourism=museum": ["sejarah", "budaya"],
  "tourism=viewpoint": ["alam", "santai"],
  "historic=*": ["sejarah"],
  "shop=mall": ["belanja"],
};

export const CATEGORY_NAMES: Record<string, string> = {
  alam: "Alam",
  pantai: "Pantai",
  kuliner: "Kuliner",
  sejarah: "Sejarah",
  budaya: "Budaya",
  belanja: "Belanja",
  santai: "Santai",
  keluarga: "Keluarga",
};

export function resolveCategories(rawCategories: string[]): string[] {
  const found = new Set<string>();

  for (const raw of rawCategories) {
    const key = raw.trim().toLowerCase();
    if (key in CATEGORY_NAMES) {
      found.add(key);
      continue;
    }

    const mapped = CATEGORY_MAP[key] ?? (key.startsWith("historic=") ? CATEGORY_MAP["historic=*"] : undefined);
    for (const slug of mapped ?? []) found.add(slug);
  }

  return found.size > 0 ? [...found] : ["alam"];
}
