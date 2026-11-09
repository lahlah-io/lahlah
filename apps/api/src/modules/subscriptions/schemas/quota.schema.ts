import { z } from "zod";
import { QUOTA_METRICS } from "../../../shared/billing/subscription.service.js";

export const quotaMetricSchema = z.enum(QUOTA_METRICS);

export const checkQuotaSchema = z.object({
  metric: quotaMetricSchema,
  amount: z.number().int().min(1).max(1000).default(1),
});
