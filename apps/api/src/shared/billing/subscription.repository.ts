import { Prisma } from "../../generated/prisma/client.js";
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
 * Flips every overdue `active` subscription to `expired`. Intended for the
 * scheduled maintenance script; request paths expire only the current user.
 */
export function expireOverdueSubscriptions(now: Date = new Date()) {
  return prisma.userSubscription.updateMany({
    where: { status: "active", expiresAt: { lt: now } },
    data: { status: "expired" },
  });
}

export function expireOverdueSubscriptionsForUser(userId: string, now: Date = new Date()) {
  return prisma.userSubscription.updateMany({
    where: { userId, status: "active", expiresAt: { lt: now } },
    data: { status: "expired" },
  });
}

/**
 * Grants the seeded free plan once per user. Safe to call on every login and on
 * every subscription read: overdue rows are expired first so a stale paid
 * subscription never blocks the free plan.
 */
export async function assignFreeSubscription(userId: string): Promise<ActiveSubscription> {
  try {
    return await prisma.$transaction((tx) => assignFreeSubscriptionTx(tx, userId));
  } catch (error) {
    // Two concurrent logins can race to create the active row; the partial
    // unique index lets one win and we reuse its result.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const active = await findActiveSubscription(userId);
      if (active) return active;
    }
    throw error;
  }
}

export async function assignFreeSubscriptionTx(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<ActiveSubscription> {
  await tx.userSubscription.updateMany({
    where: { userId, status: "active", expiresAt: { lt: new Date() } },
    data: { status: "expired" },
  });

  const existing = await tx.userSubscription.findFirst({
    where: {
      userId,
      status: "active",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
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
  return prisma.trip.count({ where: { deletedAt: null, members: { some: { userId } } } });
}
