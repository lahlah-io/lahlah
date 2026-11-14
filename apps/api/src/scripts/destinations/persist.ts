import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/client.js";
import { CATEGORY_NAMES } from "./categories.js";
import { pickSurvivor, shouldMergeDuplicate, type DedupeCandidate } from "./dedupe.js";
import type { CanonicalPlace, PlaceSource } from "./types.js";

export async function persistPlaces(
  places: CanonicalPlace[],
  successfulSources: PlaceSource[],
): Promise<{ saved: number; deactivated: number }> {
  const categories = await Promise.all(
    Object.entries(CATEGORY_NAMES).map(([slug, name]) =>
      prisma.category.upsert({
        where: { slug },
        create: { slug, name },
        update: {},
        select: { id: true, slug: true },
      }),
    ),
  );
  const categoryIds = new Map(categories.map((category) => [category.slug, category.id]));

  const touchedKeys: string[] = [];

  for (const place of places) {
    const rows = place.categorySlugs
      .map((slug) => categoryIds.get(slug))
      .filter((id): id is string => Boolean(id))
      .map((categoryId) => ({ categoryId }));

    const data = {
      name: place.name,
      description: place.description,
      address: place.address,
      city: place.city ?? "Padang",
      latitude: place.latitude,
      longitude: place.longitude,
      imageUrl: place.imageUrl,
      source: place.source,
      sourcePlaceId: place.sourcePlaceId,
      details: place.details as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
      isActive: true,
    };

    await prisma.destination.upsert({
      where: { canonicalKey: place.canonicalKey },
      create: { ...data, canonicalKey: place.canonicalKey, categories: { create: rows } },
      update: { ...data, categories: { deleteMany: {}, create: rows } },
      select: { id: true },
    });
    touchedKeys.push(place.canonicalKey);
  }

  const deactivated =
    touchedKeys.length === 0
      ? { count: 0 }
      : await prisma.destination.updateMany({
          where: {
            source: { in: successfulSources },
            canonicalKey: { notIn: touchedKeys },
            isActive: true,
          },
          data: { isActive: false },
        });

  return { saved: touchedKeys.length, deactivated: deactivated.count };
}

export async function mergeNearDuplicates(): Promise<{ merged: number }> {
const rows = await prisma.destination.findMany({
    where: { isActive: true, canonicalKey: { not: null }, latitude: { not: null }, longitude: { not: null } },
    select: {
      id: true,
      canonicalKey: true,
      name: true,
      description: true,
      address: true,
      latitude: true,
      longitude: true,
      imageUrl: true,
      source: true,
      createdAt: true,
      details: true,
    },
  });

  const candidates: DedupeCandidate[] = rows.map((row) => ({
    ...row,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    source: row.source as DedupeCandidate["source"],
    canonicalKey: row.canonicalKey,
  }));

  const retired = new Set<string>();
  let merged = 0;

  for (let i = 0; i < candidates.length; i += 1) {
    const a = candidates[i];
    if (!a || retired.has(a.id) || !a.canonicalKey) continue;

    for (let j = i + 1; j < candidates.length; j += 1) {
      const b = candidates[j];
      if (!b || retired.has(b.id) || !b.canonicalKey) continue;
      if (!shouldMergeDuplicate(a, b)) continue;

      const { survivor, loser } = pickSurvivor(a, b);
      const loserRow = rows.find((row) => row.id === loser.id);

      await prisma.$transaction([
        prisma.destination.update({
          where: { id: survivor.id },
          data: {
            description: survivor.description ?? loser.description,
            address: survivor.address ?? loser.address,
            latitude: survivor.latitude ?? loser.latitude,
            longitude: survivor.longitude ?? loser.longitude,
            imageUrl: survivor.imageUrl ?? loser.imageUrl,
            isActive: true,
          },
        }),
        prisma.destination.update({
          where: { id: loser.id },
          data: {
            isActive: false,
            details: {
              ...((loserRow?.details as Record<string, unknown>) ?? {}),
              mergedInto: survivor.id,
            } as Prisma.InputJsonValue,
          },
        }),
      ]);

      const loserCategories = await prisma.destinationCategory.findMany({
        where: { destinationId: loser.id },
        select: { categoryId: true },
      });
      if (loserCategories.length > 0) {
        await prisma.destinationCategory.createMany({
          data: loserCategories.map((row) => ({
            destinationId: survivor.id,
            categoryId: row.categoryId,
          })),
          skipDuplicates: true,
        });
      }

      retired.add(loser.id);
      merged += 1;
    }
  }

  return { merged };
}
