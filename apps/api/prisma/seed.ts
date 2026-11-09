// apps/api/prisma/seed.ts
// Seed development-only Kota Padang. Bukan data produksi, aman dijalankan berulang.
import { prisma } from "../src/db/client.js";

const categories = [
  { slug: "seed-pantai", name: "Pantai (Seed)" },
  { slug: "seed-budaya", name: "Budaya (Seed)" },
  { slug: "seed-sejarah", name: "Sejarah (Seed)" },
  { slug: "seed-alam", name: "Alam (Seed)" },
  { slug: "seed-kuliner", name: "Kuliner (Seed)" },
];

const description =
  "Contoh data development di Padang, bukan data produksi terverifikasi.";

const destinations = [
  {
    sourcePlaceId: "seed-padang-jam-gadang-placeholder",
    name: "Jam Gadang (Seed Example)",
    latitude: -0.3039,
    longitude: 100.3673,
    estimatedDurationMinutes: 60,
    categorySlugs: ["seed-sejarah", "seed-budaya"],
  },
  {
    sourcePlaceId: "seed-padang-pantai-padang",
    name: "Pantai Padang (Seed Example)",
    latitude: -0.985,
    longitude: 100.38,
    estimatedDurationMinutes: 120,
    categorySlugs: ["seed-alam"],
  },
  {
    sourcePlaceId: "seed-padang-pasaran-pakiah",
    name: "Pasar Raya Padang (Seed Example)",
    latitude: -0.9476,
    longitude: 100.365,
    estimatedDurationMinutes: 90,
    categorySlugs: ["seed-budaya", "seed-kuliner"],
  },
  {
    sourcePlaceId: "seed-padang-pantai-air-manis",
    name: "Pantai Air Manis (Seed)",
    latitude: -0.9517,
    longitude: 100.3389,
    estimatedDurationMinutes: 120,
    categorySlugs: ["seed-pantai", "seed-alam"],
  },
  {
    sourcePlaceId: "seed-padang-kota-tua",
    name: "Kota Tua Padang (Seed)",
    latitude: -0.9486,
    longitude: 100.3583,
    estimatedDurationMinutes: 90,
    categorySlugs: ["seed-sejarah", "seed-budaya"],
  },
  {
    sourcePlaceId: "seed-padang-museum-adityawarman",
    name: "Museum Adityawarman (Seed)",
    latitude: -0.9496,
    longitude: 100.3578,
    estimatedDurationMinutes: 60,
    categorySlugs: ["seed-budaya", "seed-sejarah"],
  },
  {
    sourcePlaceId: "seed-padang-pantai-cimpago",
    name: "Pantai Cimpago (Seed)",
    latitude: -0.9339,
    longitude: 100.3436,
    estimatedDurationMinutes: 90,
    categorySlugs: ["seed-pantai", "seed-alam"],
  },
];

async function main() {
  const categoryBySlug = new Map<string, string>();
  for (const category of categories) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name },
    });
    categoryBySlug.set(category.slug, row.id);
  }

  for (const destination of destinations) {
    const categoryIds = destination.categorySlugs.map((slug) => {
      const id = categoryBySlug.get(slug);
      if (!id) throw new Error(`seed category missing: ${slug}`);
      return id;
    });
    const data = {
      name: destination.name,
      description,
      latitude: destination.latitude,
      longitude: destination.longitude,
      address: null,
      city: "Padang",
      source: "admin" as const,
      sourcePlaceId: destination.sourcePlaceId,
      isActive: true,
      imageUrl: null,
      details: {
        data_kind: "development_seed",
        estimated_duration_minutes: destination.estimatedDurationMinutes,
      },
    };
    await prisma.$transaction(async (tx) => {
      const row = await tx.destination.upsert({
        where: {
          source_sourcePlaceId: {
            source: "admin",
            sourcePlaceId: destination.sourcePlaceId,
          },
        },
        create: data,
        update: data,
      });
      await tx.destinationCategory.deleteMany({ where: { destinationId: row.id } });
      await tx.destinationCategory.createMany({
        data: categoryIds.map((categoryId) => ({
          destinationId: row.id,
          categoryId,
        })),
      });
    });
  }
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
