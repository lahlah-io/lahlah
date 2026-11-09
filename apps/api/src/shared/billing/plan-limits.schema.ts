import { z } from "zod";
import { HttpError } from "../http/errors.js";

const limitCount = z.number().int().min(0);

/**
 * `details` is a JSONB column so plans can evolve without a migration. Unknown
 * keys are preserved, and `null` means "unlimited".
 */
export const planLimitsSchema = z.looseObject({
  chatMessagesPerMonth: limitCount.nullable().default(null),
  maxChatSessions: limitCount.nullable().default(null),
  maxItineraries: limitCount.nullable().default(null),
  allowedModelIds: z.array(z.uuid()).nullable().default(null),
});

export type PlanLimits = z.infer<typeof planLimitsSchema>;

/** Same limits, but without defaults so PATCH only touches the keys sent. */
export const planLimitsPatchSchema = z.looseObject({
  chatMessagesPerMonth: limitCount.nullable().optional(),
  maxChatSessions: limitCount.nullable().optional(),
  maxItineraries: limitCount.nullable().optional(),
  allowedModelIds: z.array(z.uuid()).nullable().optional(),
});

export type PlanLimitsPatch = z.infer<typeof planLimitsPatchSchema>;

export const FREE_PLAN_NAME = "free";

export const FREE_PLAN_LIMITS: PlanLimits = planLimitsSchema.parse({
  chatMessagesPerMonth: 30,
  maxChatSessions: 10,
  maxItineraries: 3,
  allowedModelIds: null,
});

export function parsePlanLimits(details: unknown): PlanLimits {
  const result = planLimitsSchema.safeParse(details ?? {});
  if (!result.success) {
    throw new HttpError(500, "PLAN_CONFIG_INVALID", "Subscription plan limits are invalid");
  }
  return result.data;
}
