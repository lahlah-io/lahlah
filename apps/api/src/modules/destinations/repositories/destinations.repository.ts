import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";
import type { listDestinationsQuerySchema } from "../schemas/destination.schema.js";
import type { z } from "zod";

const destinationSelect = {
  id: true,
  name: true,
  description: true,
  latitude: true,
  longitude: true,
  address: true,
  city: true,
  isActive: true,
  imageUrl: true,
  details: true,
  createdAt: true,
  updatedAt: true,
  categories: {
    select: { category: { select: { id: true, name: true, slug: true } } },
  },
} satisfies Prisma.DestinationSelect;

export async function findDestinations(input: z.infer<typeof listDestinationsQuerySchema>) {
  const where: Prisma.DestinationWhereInput = {
    isActive: true,
    ...(input.city ? { city: input.city } : {}),
    ...(input.category ? { categories: { some: { categoryId: input.category } } } : {}),
  };
  const [data, total] = await prisma.$transaction([
    prisma.destination.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: { createdAt: "desc" },
      select: destinationSelect,
    }),
    prisma.destination.count({ where }),
  ]);
  return { data, meta: { page: input.page, limit: input.limit, total } };
}

export const findDestinationById = (id: string) =>
  prisma.destination.findUnique({ where: { id }, select: destinationSelect });
