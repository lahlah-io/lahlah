import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../http/errors.js";
import { FREE_PLAN_NAME } from "./plan-limits.schema.js";

export const planSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  billingInterval: true,
  defaultModelId: true,
  details: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SubscriptionPlanSelect;

export const subscriptionSelect = {
  id: true,
  status: true,
  startedAt: true,
  expiresAt: true,
  plan: { select: planSelect },
} satisfies Prisma.UserSubscriptionSelect;

export type ActiveSubscription = Prisma.UserSubscriptionGetPayload<{
  select: typeof subscriptionSelect;
}>;

export function findPlanByName(name: string) {
  return prisma.subscriptionPlan.findUnique({ where: { name }, select: planSelect });
}

export function findActiveSubscription(userId: string): Promise<ActiveSubscription | null> {
  return prisma.userSubscription.findFirst({
    where: {
      userId,
      status: "active",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    select: subscriptionSelect,
  });
}

/**
 * Grants the seeded free plan once per user. Safe to call on every login.
 */
export async function assignFreeSubscription(userId: string): Promise<ActiveSubscription> {
  return prisma.$transaction((tx) => assignFreeSubscriptionTx(tx, userId));
}

export async function assignFreeSubscriptionTx(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<ActiveSubscription> {
  const existing = await tx.userSubscription.findFirst({
    where: { userId, status: "active" },
    select: subscriptionSelect,
  });
  if (existing) return existing;

  const plan = await tx.subscriptionPlan.findUnique({
    where: { name: FREE_PLAN_NAME },
    select: planSelect,
  });
  if (!plan) {
    throw new HttpError(503, "FREE_PLAN_NOT_CONFIGURED", "Free subscription plan is not configured");
  }

  return tx.userSubscription.create({
    data: {
      userId,
      planId: plan.id,
      status: "active",
      startedAt: new Date(),
    },
    select: subscriptionSelect,
  });
}

export function countChatMessagesSince(userId: string, since: Date): Promise<number> {
  return prisma.chatMessage.count({
    where: { createdAt: { gte: since }, session: { userId } },
  });
}

export function countChatSessions(userId: string): Promise<number> {
  return prisma.chatSession.count({ where: { userId } });
}

export function countItineraries(userId: string): Promise<number> {
  return prisma.itinerary.count({ where: { userId } });
}
