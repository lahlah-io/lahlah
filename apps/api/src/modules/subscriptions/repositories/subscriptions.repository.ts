import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";
import { subscriptionSelect } from "../../../shared/billing/subscription.repository.js";

export function findSubscriptionHistory(userId: string) {
  return prisma.userSubscription.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
    select: subscriptionSelect,
  });
}

export const publicModelSelect = {
  id: true,
  name: true,
  provider: true,
  modelIdentifier: true,
  priceInputPer1m: true,
  priceOutputPer1m: true,
  isActive: true,
} satisfies Prisma.ModelSelect;

/**
 * Models a plan can actually use. `null` means the plan allows every active
 * model; an empty array means none.
 */
export function findActiveModels(allowedModelIds: string[] | null) {
  return prisma.model.findMany({
    where: {
      isActive: true,
      ...(allowedModelIds === null ? {} : { id: { in: allowedModelIds } }),
    },
    orderBy: [{ provider: "asc" }, { name: "asc" }],
    select: publicModelSelect,
  });
}
