import {
  checkQuota as checkQuotaForUser,
  getMyPlan,
  toQuotaLimits,
  type QuotaMetric,
} from "../../../shared/billing/subscription.service.js";
import * as subscriptionsRepository from "../repositories/subscriptions.repository.js";

export async function getMyPlanSummary(userId: string) {
  const myPlan = await getMyPlan(userId);
  return { ...myPlan, quotaLimits: toQuotaLimits(myPlan.limits) };
}

export function checkQuota(userId: string, metric: QuotaMetric, amount: number) {
  return checkQuotaForUser(userId, metric, amount);
}

export async function getSubscriptionHistory(userId: string) {
  const history = await subscriptionsRepository.findSubscriptionHistory(userId);
  return history.map((subscription) => ({
    id: subscription.id,
    status: subscription.status,
    startedAt: subscription.startedAt,
    expiresAt: subscription.expiresAt,
    plan: {
      id: subscription.plan.id,
      name: subscription.plan.name,
      price: subscription.plan.price.toFixed(2),
      billingInterval: subscription.plan.billingInterval,
    },
  }));
}
