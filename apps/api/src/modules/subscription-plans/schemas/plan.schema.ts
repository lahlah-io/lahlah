import { z } from "zod";
import { planLimitsPatchSchema, planLimitsSchema } from "../../../shared/billing/plan-limits.schema.js";
import { paginationQuerySchema } from "../../../shared/schemas/pagination.schema.js";

const label = z.string().trim().min(1).max(255);

const price = z
  .union([z.number().finite().min(0), z.string().trim().regex(/^\d+(\.\d{1,2})?$/)])
  .transform((value) => String(value));

export const billingIntervalSchema = z.enum(["monthly", "yearly", "forever"]);

export const createPlanSchema = z.object({
  name: label,
  description: z.string().trim().max(2000).optional(),
  price: price.default("0"),
  billingInterval: billingIntervalSchema.default("monthly"),
  defaultModelId: z.uuid().nullable().optional(),
  details: planLimitsSchema.optional(),
});

export const updatePlanSchema = z
  .object({
    name: label,
    description: z.string().trim().max(2000),
    price,
    billingInterval: billingIntervalSchema,
    defaultModelId: z.uuid().nullable(),
    details: planLimitsPatchSchema,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, "At least one field is required");

export const listPlansQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(255).optional(),
});

export const planIdSchema = z.object({ id: z.uuid() });
