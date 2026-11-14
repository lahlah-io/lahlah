// apps/api/prisma/seed.ts
// Seed Kota Padang: data scraper (hasil export) + contoh dev kecil. Idempoten, aman dijalankan berulang.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Prisma } from "../src/generated/prisma/client.js";
import { prisma } from "../src/db/client.js";

type SeedCategory = { slug: string; name: string };
type SeedDestination = {
  canonicalKey: string | null;
  name: string;
  description: string | null;
  latitude: string | null;
  longitude: string | null;
  address: string | null;
  city: string | null;
  source: "geoapify" | "firecrawl" | "overpass" | "wikidata" | "manual" | "admin" | "user";
  sourcePlaceId: string | null;
  isActive: boolean;
  imageUrl: string | null;
  details: unknown;
  categorySlugs: string[];
};
type SeedData = { categories: SeedCategory[]; destinations: SeedDestination[] };

const DEV_CATEGORIES: SeedCategory[] = [
  { slug: "seed-pantai", name: "Pantai (Seed)" },
  { slug: "seed-budaya", name: "Budaya (Seed)" },
  { slug: "seed-sejarah", name: "Sejarah (Seed)" },
  { slug: "seed-alam", name: "Alam (Seed)" },
  { slug: "seed-kuliner", name: "Kuliner (Seed)" },
];

const DEV_DESCRIPTION = "Contoh data development di Padang, bukan data produksi terverifikasi.";
const DEV_DESTINATIONS = [
  { sourcePlaceId: "seed-padang-jam-gadang-placeholder", name: "Jam Gadang (Seed Example)", latitude: -0.3039, longitude: 100.3673, estimatedDurationMinutes: 60, categorySlugs: ["seed-sejarah", "seed-budaya"] },
  { sourcePlaceId: "seed-padang-pantai-padang", name: "Pantai Padang (Seed Example)", latitude: -0.985, longitude: 100.38, estimatedDurationMinutes: 120, categorySlugs: ["seed-alam"] },
  { sourcePlaceId: "seed-padang-pasar-raya", name: "Pasar Raya Padang (Seed Example)", latitude: -0.9476, longitude: 100.365, estimatedDurationMinutes: 90, categorySlugs: ["seed-budaya", "seed-kuliner"] },
  { sourcePlaceId: "seed-padang-pantai-air-manis", name: "Pantai Air Manis (Seed)", latitude: -0.9517, longitude: 100.3389, estimatedDurationMinutes: 120, categorySlugs: ["seed-pantai", "seed-alam"] },
  { sourcePlaceId: "seed-padang-kota-tua", name: "Kota Tua Padang (Seed)", latitude: -0.9486, longitude: 100.3583, estimatedDurationMinutes: 90, categorySlugs: ["seed-sejarah", "seed-budaya"] },
  { sourcePlaceId: "seed-padang-museum-adityawarman", name: "Museum Adityawarman (Seed)", latitude: -0.9496, longitude: 100.3578, estimatedDurationMinutes: 60, categorySlugs: ["seed-budaya", "seed-sejarah"] },
  { sourcePlaceId: "seed-padang-pantai-cimpago", name: "Pantai Cimpago (Seed)", latitude: -0.9339, longitude: 100.3436, estimatedDurationMinutes: 90, categorySlugs: ["seed-pantai", "seed-alam"] },
];

function dec(value: string | number | null): Prisma.Decimal | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? new Prisma.Decimal(value) : null;
  const s = value.trim();
  // shortcut: HTML penulis memakai "-" untuk koordinat tak diketahui; simpan null.
  if (s === "" || s === "-" || s.toLowerCase() === "null") return null;
  const n = Number(s);
  return Number.isFinite(n) ? new Prisma.Decimal(n) : null;
}

async function upsertCategory(category: SeedCategory, map: Map<string, string>) {
  const row = await prisma.category.upsert({
    where: { slug: category.slug },
    create: category,
    update: { name: category.name },
    select: { id: true },
  });
  map.set(category.slug, row.id);
}

async function syncLinks(destinationId: string, categorySlugs: string[], map: Map<string, string>) {
  const ids = categorySlugs.map((slug) => map.get(slug)).filter((id): id is string => Boolean(id));
  await prisma.destinationCategory.deleteMany({ where: { destinationId } });
  if (ids.length > 0) {
    await prisma.destinationCategory.createMany({
      data: ids.map((categoryId) => ({ destinationId, categoryId })),
      skipDuplicates: true,
    });
  }
}

async function seedDevExamples(categoryMap: Map<string, string>) {
  for (const c of DEV_CATEGORIES) await upsertCategory(c, categoryMap);
  for (const d of DEV_DESTINATIONS) {
    const data = {
      name: d.name,
      description: DEV_DESCRIPTION,
      latitude: new Prisma.Decimal(d.latitude),
      longitude: new Prisma.Decimal(d.longitude),
      address: null,
      city: "Padang",
      source: "admin" as const,
      sourcePlaceId: d.sourcePlaceId,
      isActive: true,
      imageUrl: null,
      details: { data_kind: "development_seed", estimated_duration_minutes: d.estimatedDurationMinutes },
    };
    const row = await prisma.destination.upsert({
      where: { source_sourcePlaceId: { source: "admin", sourcePlaceId: d.sourcePlaceId } },
      create: { ...data, canonicalKey: null },
      update: data,
      select: { id: true },
    });
    await syncLinks(row.id, d.categorySlugs, categoryMap);
  }
}

async function seedScraped(categoryMap: Map<string, string>) {
  const here = dirname(fileURLToPath(import.meta.url));
  const dataPath = join(here, "seed-data", "destinations.padang.primary.json");
  let raw: string;
  try {
    raw = readFileSync(dataPath, "utf8");
  } catch {
    console.log("seed-data/destinations.padang.primary.json tidak ditemukan; melewati data scraper.");
    return;
  }
  const data = JSON.parse(raw) as SeedData;
  for (const c of data.categories) await upsertCategory(c, categoryMap);

  let saved = 0;
  for (const d of data.destinations) {
    const rowData = {
      name: d.name,
      description: d.description,
      latitude: dec(d.latitude),
      longitude: dec(d.longitude),
      address: d.address,
      city: d.city ?? "Padang",
      source: d.source,
      sourcePlaceId: d.sourcePlaceId,
      isActive: d.isActive ?? true,
      imageUrl: d.imageUrl,
      details: (d.details ?? {}) as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
    };
    let row: { id: string };
    if (d.canonicalKey) {
      row = await prisma.destination.upsert({
        where: { canonicalKey: d.canonicalKey },
        create: { ...rowData, canonicalKey: d.canonicalKey },
        update: rowData,
        select: { id: true },
      });
    } else if (d.sourcePlaceId) {
      row = await prisma.destination.upsert({
        where: { source_sourcePlaceId: { source: d.source, sourcePlaceId: d.sourcePlaceId } },
        create: { ...rowData, canonicalKey: null },
        update: rowData,
        select: { id: true },
      });
    } else {
      continue;
    }
    await syncLinks(row.id, d.categorySlugs, categoryMap);
    saved += 1;
  }
  console.log(`Seed scraper: ${data.categories.length} kategori, ${saved} destinasi.`);
}

async function main() {
  const categoryMap = new Map<string, string>();
  await seedDevExamples(categoryMap);
  await seedScraped(categoryMap);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
