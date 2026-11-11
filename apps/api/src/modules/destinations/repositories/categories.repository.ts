import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";
import type { listCategoriesQuerySchema } from "../schemas/category.schema.js";
import type { z } from "zod";

export const categorySelect = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CategorySelect;

export type CategoryRecord = Prisma.CategoryGetPayload<{ select: typeof categorySelect }>;

export async function findCategories(input: z.infer<typeof listCategoriesQuerySchema>) {
  const where: Prisma.CategoryWhereInput = input.q
    ? {
        OR: [
          { name: { contains: input.q, mode: "insensitive" } },
          { slug: { contains: input.q, mode: "insensitive" } },
        ],
      }
    : {};

  const [data, total] = await prisma.$transaction([
    prisma.category.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: { name: "asc" },
      select: categorySelect,
    }),
    prisma.category.count({ where }),
  ]);

  return { data, meta: { page: input.page, limit: input.limit, total } };
}

export const findCategoryById = (id: string) =>
  prisma.category.findUnique({ where: { id }, select: categorySelect });

export const findCategoriesByIds = (ids: string[]) =>
  prisma.category.findMany({ where: { id: { in: ids } }, select: { id: true } });

export const insertCategory = (data: Prisma.CategoryCreateInput) =>
  prisma.category.create({ data, select: categorySelect });

export const patchCategory = (id: string, data: Prisma.CategoryUpdateInput) =>
  prisma.category.update({ where: { id }, data, select: categorySelect });

/**
 * `destination_categories` has `onDelete: Cascade` on the category relation, so
 * deleting a category only unlinks its tags and never touches destinations.
 */
export const deleteCategoryById = (id: string) => prisma.category.delete({ where: { id } });
