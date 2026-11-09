import { prisma } from "../../../db/client.js";
import { subscriptionSelect } from "../../../shared/billing/subscription.repository.js";

export function findSubscriptionHistory(userId: string) {
  return prisma.userSubscription.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
    select: subscriptionSelect,
  });
}
