import { HttpError } from "../http/errors.js";
import { parsePlanLimits, type PlanLimits } from "./plan-limits.schema.js";
import * as subscriptionRepository from "./subscription.repository.js";
import type { ActiveSubscription } from "./subscription.repository.js";

export const QUOTA_METRICS = ["chatMessages", "chatSessions", "itineraries"] as const;

export type QuotaMetric = (typeof QUOTA_METRICS)[number];

export type QuotaUsage = Record<QuotaMetric, number>;

export type QuotaLimits = Record<QuotaMetric, number | null>;

export type QuotaPeriod = {
  start: Date;
  end: Date;
};

export type MyPlan = {
  subscription: {
    id: string;
    status: ActiveSubscription["status"];
    startedAt: Date | null;
    expiresAt: Date | null;
  };
  plan: {
    id: string;
    name: string;
    description: string | null;
    price: string;
    billingInterval: string;
    defaultModelId: string | null;
  };
  limits: PlanLimits;
  usage: QuotaUsage;
  period: QuotaPeriod;
};

export const ensureFreeSubscription = subscriptionRepository.assignFreeSubscription;
export const getActiveSubscription = subscriptionRepository.findActiveSubscription;

export function quotaPeriod(now: Date = new Date()): QuotaPeriod {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

export function limitForMetric(limits: PlanLimits, metric: QuotaMetric): number | null {
  switch (metric) {
    case "chatMessages":
      return limits.chatMessagesPerMonth;
    case "chatSessions":
      return limits.maxChatSessions;
    case "itineraries":
      return limits.maxItineraries;
  }
}

export function isModelAllowed(limits: PlanLimits, modelId: string): boolean {
  return limits.allowedModelIds === null || limits.allowedModelIds.includes(modelId);
}

async function loadPlan(userId: string): Promise<{ subscription: ActiveSubscription; limits: PlanLimits }> {
  const subscription = await subscriptionRepository.findActiveSubscription(userId);
  if (!subscription) {
    throw new HttpError(404, "SUBSCRIPTION_NOT_FOUND", "No active subscription");
  }
  return { subscription, limits: parsePlanLimits(subscription.plan.details) };
}

export async function getUsage(userId: string, period: QuotaPeriod): Promise<QuotaUsage> {
  const [chatMessages, chatSessions, itineraries] = await Promise.all([
    subscriptionRepository.countChatMessagesSince(userId, period.start),
    subscriptionRepository.countChatSessions(userId),
    subscriptionRepository.countItineraries(userId),
  ]);
  return { chatMessages, chatSessions, itineraries };
}

export function toQuotaLimits(limits: PlanLimits): QuotaLimits {
  return {
    chatMessages: limits.chatMessagesPerMonth,
    chatSessions: limits.maxChatSessions,
    itineraries: limits.maxItineraries,
  };
}

export async function getMyPlan(userId: string): Promise<MyPlan> {
  const { subscription, limits } = await loadPlan(userId);
  const period = quotaPeriod();
  const usage = await getUsage(userId, period);

  return {
    subscription: {
      id: subscription.id,
      status: subscription.status,
      startedAt: subscription.startedAt,
      expiresAt: subscription.expiresAt,
    },
    plan: {
      id: subscription.plan.id,
      name: subscription.plan.name,
      description: subscription.plan.description,
      price: subscription.plan.price.toFixed(2),
      billingInterval: subscription.plan.billingInterval,
      defaultModelId: subscription.plan.defaultModelId,
    },
    limits,
    usage,
    period,
  };
}

export type QuotaCheck = {
  metric: QuotaMetric;
  allowed: boolean;
  limit: number | null;
  used: number;
  amount: number;
  remaining: number | null;
  period: QuotaPeriod;
};

/**
 * Called by the chat module before processing a message, and exposed over HTTP
 * for the UI. `null` limits mean unlimited.
 */
export async function checkQuota(
  userId: string,
  metric: QuotaMetric,
  amount = 1,
): Promise<QuotaCheck> {
  const { limits } = await loadPlan(userId);
  const period = quotaPeriod();
  const usage = await getUsage(userId, period);
  const limit = limitForMetric(limits, metric);
  const used = usage[metric];

  return {
    metric,
    allowed: limit === null || used + amount <= limit,
    limit,
    used,
    amount,
    remaining: limit === null ? null : Math.max(limit - used - amount, 0),
    period,
  };
}
