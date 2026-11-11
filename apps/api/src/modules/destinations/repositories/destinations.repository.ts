import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";
import { categorySelect } from "./categories.repository.js";
import type { CategoryRecord } from "./categories.repository.js";
import type { listDestinationsQuerySchema } from "../schemas/destination.schema.js";
import type { z } from "zod";

export const destinationSelect = {
  id: true,
  name: true,
  description: true,
  latitude: true,
  longitude: true,
  address: true,
  source: true,
  sourcePlaceId: true,
  createdBy: true,
  isActive: true,
  imageUrl: true,
  details: true,
  lastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
  categories: {
    select: { category: { select: categorySelect } },
  },
} satisfies Prisma.DestinationSelect;

export type DestinationRecord = Prisma.DestinationGetPayload<{
  select: typeof destinationSelect;
}>;

export type DestinationResponse = Omit<
  DestinationRecord,
  "categories" | "latitude" | "longitude"
> & {
  latitude: string | null;
  longitude: string | null;
  categories: CategoryRecord[];
};

/**
 * Coordinates are stored as `decimal(10,7)`. Normalising them on output keeps
 * the API deterministic (`-6.2000000` instead of `-6.2`) and matches the
 * 7-decimal strings accepted by the request schema.
 */
export function toDestinationResponse(record: DestinationRecord): DestinationResponse {
  return {
    ...record,
    latitude: record.latitude?.toFixed(7) ?? null,
    longitude: record.longitude?.toFixed(7) ?? null,
    categories: record.categories.map((link) => link.category),
  };
}

export async function findDestinations(input: z.infer<typeof listDestinationsQuerySchema>) {
  const where: Prisma.DestinationWhereInput = {
    ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    ...(input.source === undefined ? {} : { source: input.source }),
    ...(input.categoryId ? { categories: { some: { categoryId: input.categoryId } } } : {}),
    ...(input.q
      ? {
          OR: [
            { name: { contains: input.q, mode: "insensitive" } },
            { address: { contains: input.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [data, total] = await prisma.$transaction([
    prisma.destination.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: { name: "asc" },
      select: destinationSelect,
    }),
    prisma.destination.count({ where }),
  ]);

  return { data: data.map(toDestinationResponse), meta: { page: input.page, limit: input.limit, total } };
}

export const findDestinationById = (id: string) =>
  prisma.destination.findUnique({ where: { id }, select: destinationSelect });

export function insertDestination(
  data: Prisma.DestinationUncheckedCreateInput,
  categoryIds: string[],
): Promise<DestinationRecord> {
  return prisma.$transaction(async (tx) => {
    const destination = await tx.destination.create({ data, select: { id: true } });
    if (categoryIds.length > 0) {
      await tx.destinationCategory.createMany({
        data: categoryIds.map((categoryId) => ({ destinationId: destination.id, categoryId })),
      });
    }
    return tx.destination.findUniqueOrThrow({
      where: { id: destination.id },
      select: destinationSelect,
    });
  });
}

export function updateDestination(
  id: string,
  data: Prisma.DestinationUncheckedUpdateInput,
  categoryIds: string[] | undefined,
): Promise<DestinationRecord> {
  return prisma.$transaction(async (tx) => {
    await tx.destination.update({ where: { id }, data, select: { id: true } });

    if (categoryIds !== undefined) {
      await tx.destinationCategory.deleteMany({ where: { destinationId: id } });
      if (categoryIds.length > 0) {
        await tx.destinationCategory.createMany({
          data: categoryIds.map((categoryId) => ({ destinationId: id, categoryId })),
        });
      }
    }

    return tx.destination.findUniqueOrThrow({ where: { id }, select: destinationSelect });
  });
}

export const deactivateDestination = (id: string) =>
  prisma.destination.update({
    where: { id },
    data: { isActive: false },
    select: destinationSelect,
  });
