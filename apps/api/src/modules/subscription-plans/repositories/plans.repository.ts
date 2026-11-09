import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";
import { planSelect } from "../../../shared/billing/subscription.repository.js";
import type { listPlansQuerySchema } from "../schemas/plan.schema.js";
import type { z } from "zod";

export async function findPlans(input: z.infer<typeof listPlansQuerySchema>) {
  const where: Prisma.SubscriptionPlanWhereInput = input.q
    ? { name: { contains: input.q, mode: "insensitive" } }
    : {};

  const [data, total] = await prisma.$transaction([
    prisma.subscriptionPlan.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ price: "asc" }, { name: "asc" }],
      select: planSelect,
    }),
    prisma.subscriptionPlan.count({ where }),
  ]);

  return { data, meta: { page: input.page, limit: input.limit, total } };
}

export const findPlanById = (id: string) =>
  prisma.subscriptionPlan.findUnique({ where: { id }, select: planSelect });

export const insertPlan = (data: Prisma.SubscriptionPlanCreateInput) =>
  prisma.subscriptionPlan.create({ data, select: planSelect });

export const patchPlan = (id: string, data: Prisma.SubscriptionPlanUpdateInput) =>
  prisma.subscriptionPlan.update({ where: { id }, data, select: planSelect });

export const deletePlanById = (id: string) => prisma.subscriptionPlan.delete({ where: { id } });

export const countSubscriptionsForPlan = (planId: string) =>
  prisma.userSubscription.count({ where: { planId } });

export const findModelForPlan = (id: string) =>
  prisma.model.findUnique({ where: { id }, select: { id: true, isActive: true } });
