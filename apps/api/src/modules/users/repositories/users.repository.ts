import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";
import type { createUserSchema, listUsersQuerySchema, updateUserSchema } from "../schemas/user.schema.js";
import type { z } from "zod";

const userSelect = {
  id: true,
  pid: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export async function findUsers(input: z.infer<typeof listUsersQuerySchema>) {
  const where: Prisma.UserWhereInput = input.isActive === undefined ? {} : { isActive: input.isActive };
  const [data, total] = await prisma.$transaction([
    prisma.user.findMany({ where, skip: (input.page - 1) * input.limit, take: input.limit, orderBy: { createdAt: "desc" }, select: userSelect }),
    prisma.user.count({ where }),
  ]);
  return { data, meta: { page: input.page, limit: input.limit, total } };
}

export const findUserById = (id: string) => prisma.user.findUnique({ where: { id }, select: userSelect });
export const insertUser = (input: z.infer<typeof createUserSchema>) => prisma.user.create({ data: input, select: userSelect });
export const patchUser = (id: string, input: z.infer<typeof updateUserSchema>) => prisma.user.update({ where: { id }, data: input, select: userSelect });
export const deactivateUserById = (id: string) => prisma.user.update({ where: { id }, data: { isActive: false }, select: userSelect });
