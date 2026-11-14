// apps/api/prisma/seed.ts
// Seed Kota Padang: data scraper (hasil export) + contoh dev kecil. Idempoten, aman dijalankan berulang.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Prisma } from "../src/generated/prisma/client.js";
import { prisma } from "../src/db/client.js";
import { resolveDistrict } from "../src/shared/geo/padang-district.js";

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
  const seededKeys: string[] = [];
  for (const d of data.destinations) {
    const rowData = {
      name: d.name,
      description: d.description,
      latitude: dec(d.latitude),
      longitude: dec(d.longitude),
      address: d.address,
      city: d.city ?? "Padang",
      district: resolveDistrict(d.address),
      source: d.source,
      sourcePlaceId: d.sourcePlaceId,
      isActive: d.isActive ?? true,
      imageUrl: d.imageUrl,
      details: (d.details ?? {}) as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
    };
    // Baris lama bisa cocok lewat canonicalKey atau sourcePlaceId (mis. nama berubah saat
    // data gmaps baru masuk), jadi cari dulu salah satu, baru update/create — bukan upsert
    // pada satu unique key saja.
    const existing = await prisma.destination.findFirst({
      where: {
        OR: [
          ...(d.canonicalKey ? [{ canonicalKey: d.canonicalKey }] : []),
          ...(d.sourcePlaceId ? [{ source: d.source, sourcePlaceId: d.sourcePlaceId }] : []),
        ],
      },
      select: { id: true },
    });
    if (!existing && !d.canonicalKey && !d.sourcePlaceId) continue;
    if (d.canonicalKey) seededKeys.push(d.canonicalKey);
    const row = existing
      ? await prisma.destination.update({
          where: { id: existing.id },
          data: { ...rowData, ...(d.canonicalKey ? { canonicalKey: d.canonicalKey } : {}) },
          select: { id: true },
        })
      : await prisma.destination.create({
          data: { ...rowData, canonicalKey: d.canonicalKey ?? null },
          select: { id: true },
        });
    await syncLinks(row.id, d.categorySlugs, categoryMap);
    saved += 1;
  }
  // Data katalog yang tidak ada lagi di seeder dinonaktifkan, bukan dihapus:
  // trip_destinations memakai onDelete Restrict dan riwayat trip user harus tetap utuh.
  // Destinasi buatan admin/user tidak disentuh.
  if (seededKeys.length > 0) {
    const stale = await prisma.destination.updateMany({
      where: {
        city: "Padang",
        isActive: true,
        source: { notIn: ["admin", "user"] },
        canonicalKey: { notIn: seededKeys },
      },
      data: { isActive: false },
    });
    if (stale.count > 0) console.log(`Seed scraper: ${stale.count} destinasi lama dinonaktifkan.`);
  }
  console.log(`Seed scraper: ${data.categories.length} kategori, ${saved} destinasi.`);
}

// --- Home feed demo data -----------------------------------------------------
// Fixed ids keep `pnpm db:seed` idempotent: rows are upserted by id and child
// rows are rebuilt instead of appended.

const SEED_USERS = [
  { id: "11111111-1111-4111-8111-000000000001", name: "Raisya Putri", username: "seed-raisya", email: "raisya@seed.lahlah.local" },
  { id: "11111111-1111-4111-8111-000000000002", name: "Bagas Pratama", username: "seed-bagas", email: "bagas@seed.lahlah.local" },
  { id: "11111111-1111-4111-8111-000000000003", name: "Nadia Salsabila", username: "seed-nadia", email: "nadia@seed.lahlah.local" },
  { id: "11111111-1111-4111-8111-000000000004", name: "Fajar Ramadhan", username: "seed-fajar", email: "fajar@seed.lahlah.local" },
  { id: "11111111-1111-4111-8111-000000000005", name: "Intan Permata", username: "seed-intan", email: "intan@seed.lahlah.local" },
] as const;

const SEED_TRIP_THEMES = [
  "Pantai & sunset",
  "Kuliner legendaris",
  "Jejak sejarah",
  "Liburan keluarga",
] as const;

const SEED_TRIPS_PER_USER = SEED_TRIP_THEMES.length;
const SEED_SHARE_CHANNELS = ["whatsapp", "instagram", "link"] as const;

const seedTripId = (index: number) => `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`;

async function seedFeed() {
  const pool = await prisma.destination.findMany({
    where: { city: "Padang", isActive: true, latitude: { not: null }, longitude: { not: null } },
    orderBy: { name: "asc" },
    select: { id: true },
  });
  if (pool.length === 0) {
    console.log("Seed feed: destinasi Padang belum ada; lewati data beranda.");
    return;
  }

  for (const user of SEED_USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: user,
      update: { name: user.name, username: user.username, email: user.email },
    });
  }

  let index = 0;
  for (const author of SEED_USERS) {
    for (let theme = 0; theme < SEED_TRIPS_PER_USER; theme += 1) {
      const tripId = seedTripId(index);
      const stopCount = 3 + (index % 3);
      const start = (index * 13) % Math.max(pool.length - stopCount, 1);
      const stops = pool.slice(start, start + stopCount);
      // Staggered so the feed order is stable: the first trip is the newest.
      const updatedAt = new Date(Date.now() - index * 3 * 3_600_000);
      const batchCreatedAt = new Date(Date.UTC(2026, 0, 1) + index * 60_000);

      await prisma.trip.upsert({
        where: { id: tripId },
        create: {
          id: tripId,
          title: `${SEED_TRIP_THEMES[theme]} di Padang (${author.name.split(" ")[0]})`,
          isPublic: true,
          createdAt: updatedAt,
          updatedAt,
        },
        update: {
          title: `${SEED_TRIP_THEMES[theme]} di Padang (${author.name.split(" ")[0]})`,
          isPublic: true,
          updatedAt,
        },
      });
      await prisma.userTrip.upsert({
        where: { userId_tripId: { userId: author.id, tripId } },
        create: { userId: author.id, tripId, status: "active" },
        update: { status: "active" },
      });

      await prisma.tripDestination.deleteMany({ where: { tripId } });
      await prisma.tripDestination.createMany({
        data: stops.map((destination, position) => ({
          tripId,
          destinationId: destination.id,
          visitAt: new Date(Date.UTC(2026, 0, 2, 8 + position * 2)),
          createdAt: batchCreatedAt,
        })),
      });

      const likers = SEED_USERS.slice(0, index % SEED_USERS.length);
      const viewers = SEED_USERS.slice(0, 1 + (index % SEED_USERS.length));
      const sharers = SEED_USERS.slice(0, index % SEED_SHARE_CHANNELS.length);
      await prisma.tripLike.deleteMany({ where: { tripId } });
      await prisma.tripView.deleteMany({ where: { tripId } });
      await prisma.tripShare.deleteMany({ where: { tripId } });
      await prisma.tripLike.createMany({ data: likers.map((user) => ({ userId: user.id, tripId })) });
      await prisma.tripView.createMany({ data: viewers.map((user) => ({ userId: user.id, tripId })) });
      await prisma.tripShare.createMany({
        data: sharers.map((user, channel) => ({
          userId: user.id,
          tripId,
          channel: SEED_SHARE_CHANNELS[channel]!,
        })),
      });

      index += 1;
    }
  }

  console.log(`Seed feed: ${SEED_USERS.length} user, ${index} trip publik.`);
}

async function cleanupLegacySeed() {
  const legacyDestinations = await prisma.destination.findMany({
    where: { source: "admin", sourcePlaceId: { startsWith: "seed-padang-" } },
    select: { id: true },
  });
  if (legacyDestinations.length > 0) {
    const ids = legacyDestinations.map((d) => d.id);
    // TripDestination memakai onDelete: Restrict; hapus turunannya dulu.
    await prisma.tripDestination.deleteMany({ where: { destinationId: { in: ids } } });
    await prisma.destinationCategory.deleteMany({ where: { destinationId: { in: ids } } });
    await prisma.destination.deleteMany({ where: { id: { in: ids } } });
  }

  const legacyCategories = await prisma.category.findMany({
    where: { slug: { startsWith: "seed-" } },
    select: { id: true },
  });
  if (legacyCategories.length > 0) {
    const ids = legacyCategories.map((c) => c.id);
    await prisma.destinationCategory.deleteMany({ where: { categoryId: { in: ids } } });
    await prisma.category.deleteMany({ where: { id: { in: ids } } });
  }
}

async function main() {
  const categoryMap = new Map<string, string>();
  await cleanupLegacySeed();
  await seedScraped(categoryMap);
  await seedFeed();
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
