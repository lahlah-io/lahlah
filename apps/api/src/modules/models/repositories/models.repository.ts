import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";
import type {
  createModelSchema,
  listModelsQuerySchema,
  updateModelSchema,
} from "../schemas/model.schema.js";
import type { z } from "zod";

export const modelSelect = {
  id: true,
  name: true,
  provider: true,
  modelIdentifier: true,
  priceInputPer1m: true,
  priceOutputPer1m: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ModelSelect;

export async function findModels(input: z.infer<typeof listModelsQuerySchema>) {
  const where: Prisma.ModelWhereInput = {
    ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    ...(input.q
      ? {
          OR: [
            { name: { contains: input.q, mode: "insensitive" } },
            { provider: { contains: input.q, mode: "insensitive" } },
            { modelIdentifier: { contains: input.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [data, total] = await prisma.$transaction([
    prisma.model.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ provider: "asc" }, { name: "asc" }],
      select: modelSelect,
    }),
    prisma.model.count({ where }),
  ]);

  return { data, meta: { page: input.page, limit: input.limit, total } };
}

export const findModelById = (id: string) =>
  prisma.model.findUnique({ where: { id }, select: modelSelect });

export const insertModel = (input: z.infer<typeof createModelSchema>) =>
  prisma.model.create({ data: input, select: modelSelect });

export const patchModel = (id: string, input: z.infer<typeof updateModelSchema>) =>
  prisma.model.update({ where: { id }, data: input, select: modelSelect });

export const deactivateModelById = (id: string) =>
  prisma.model.update({ where: { id }, data: { isActive: false }, select: modelSelect });
