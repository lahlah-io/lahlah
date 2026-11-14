import type { RawPlace } from "../types.js";

type ManualEntry = {
  slug: string;
  name: string;
  description: string;
  categories: string[];
};

const ENTRIES: ManualEntry[] = [
  {
    slug: "pantai-padang",
    name: "Pantai Padang",
    description: "Pantai panjang di pusat Kota Padang, ramai saat sore hari.",
    categories: ["pantai", "alam", "santai"],
  },
  {
    slug: "pantai-air-manis",
    name: "Pantai Air Manis",
    description: "Pantai dengan batu Malin Kundang di selatan Kota Padang.",
    categories: ["pantai", "alam", "budaya"],
  },
  {
    slug: "jembatan-sitti-nurbaya",
    name: "Jembatan Sitti Nurbaya",
    description: "Jembatan ikonik di atas Batang Arau dengan pemandangan muara.",
    categories: ["sejarah", "budaya", "santai"],
  },
  {
    slug: "gunung-padang",
    name: "Gunung Padang",
    description: "Bukit di pesisir Padang dengan panorama kota dan laut.",
    categories: ["alam", "santai"],
  },
  {
    slug: "museum-adityawarman",
    name: "Museum Adityawarman",
    description: "Museum yang menyimpan koleksi budaya Minangkabau.",
    categories: ["sejarah", "budaya"],
  },
  {
    slug: "pasar-raya-padang",
    name: "Pasar Raya Padang",
    description: "Pasar pusat untuk belanja dan kuliner khas Padang.",
    categories: ["belanja", "kuliner"],
  },
  {
    slug: "pantai-nirwana",
    name: "Pantai Nirwana",
    description: "Pantai di selatan Padang dengan ombak tenang.",
    categories: ["pantai", "alam", "keluarga"],
  },
  {
    slug: "lubuk-minturun",
    name: "Lubuk Minturun",
    description: "Kawasan sungai dan pemandian di pinggiran Padang.",
    categories: ["alam", "keluarga", "santai"],
  },
  {
    slug: "bukit-gado-gado",
    name: "Bukit Gado-Gado",
    description: "Bukit dengan pemandangan kota dan matahari terbenam.",
    categories: ["alam", "santai"],
  },
  {
    slug: "taman-budaya-sumatera-barat",
    name: "Taman Budaya Sumatera Barat",
    description: "Ruang pertunjukan dan kegiatan budaya di Padang.",
    categories: ["budaya", "keluarga"],
  },
  {
    slug: "pantai-pasir-jambak",
    name: "Pantai Pasir Jambak",
    description: "Pantai di utara Padang yang cocok untuk bersantai.",
    categories: ["pantai", "alam", "santai"],
  },
  {
    slug: "pantai-karang-harau",
    name: "Pantai Karang Harau",
    description: "Pantai berbatu di utara Kota Padang.",
    categories: ["pantai", "alam"],
  },
  {
    slug: "goa-jepang-lubang-minturun",
    name: "Goa Jepang Lubang Minturun",
    description: "Sisa goa peninggalan masa pendudukan Jepang.",
    categories: ["sejarah"],
  },
];

export async function fetchManual(): Promise<RawPlace[]> {
  return ENTRIES.map((entry) => ({
    source: "manual" as const,
    sourcePlaceId: entry.slug,
    name: entry.name,
    description: entry.description,
    address: "Kota Padang",
    latitude: null,
    longitude: null,
    imageUrl: null,
    rawCategories: entry.categories,
    details: { provider: "manual" },
  }));
}
