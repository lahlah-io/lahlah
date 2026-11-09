import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";
import { assignFreeSubscriptionTx } from "../../../shared/billing/subscription.repository.js";
import type {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from "../schemas/user.schema.js";
import type { Role } from "../../../generated/prisma/enums.js";
import type { z } from "zod";

export const userSelect = {
  id: true,
  pid: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  subscriptions: {
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      id: true,
      status: true,
      startedAt: true,
      expiresAt: true,
      plan: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.UserSelect;

export async function findUsers(input: z.infer<typeof listUsersQuerySchema>) {
  const where: Prisma.UserWhereInput = {
    ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    ...(input.role === undefined ? {} : { role: input.role }),
    ...(input.q
      ? {
          OR: [
            { name: { contains: input.q, mode: "insensitive" } },
            { email: { contains: input.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [data, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: { createdAt: "desc" },
      select: userSelect,
    }),
    prisma.user.count({ where }),
  ]);

  return { data, meta: { page: input.page, limit: input.limit, total } };
}

export const findUserById = (id: string) => prisma.user.findUnique({ where: { id }, select: userSelect });

/**
 * Creating a user and granting the free plan happen in one transaction so a
 * user can never exist without an active subscription.
 */
export function insertUserWithFreeSubscription(input: z.infer<typeof createUserSchema>) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: input, select: { id: true } });
    await assignFreeSubscriptionTx(tx, user.id);
    return tx.user.findUniqueOrThrow({ where: { id: user.id }, select: userSelect });
  });
}

export const patchUser = (id: string, input: z.infer<typeof updateUserSchema>) =>
  prisma.user.update({ where: { id }, data: input, select: userSelect });

export const patchUserRole = (id: string, role: Role) =>
  prisma.user.update({ where: { id }, data: { role }, select: userSelect });

export const patchUserStatus = (id: string, isActive: boolean) =>
  prisma.user.update({ where: { id }, data: { isActive }, select: userSelect });
