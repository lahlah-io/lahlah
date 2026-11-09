import { z } from "zod";
import { paginationQuerySchema } from "../../../shared/schemas/pagination.schema.js";

const label = z.string().trim().min(1).max(255);

/** Money is sent as a number or a decimal string and stored as Prisma Decimal. */
const price = z
  .union([z.number().finite().min(0), z.string().trim().regex(/^\d+(\.\d{1,6})?$/)])
  .transform((value) => String(value));

export const createModelSchema = z.object({
  name: label,
  provider: label,
  modelIdentifier: label,
  priceInputPer1m: price.default("0"),
  priceOutputPer1m: price.default("0"),
  isActive: z.boolean().default(true),
});

export const updateModelSchema = z
  .object({
    name: label,
    provider: label,
    modelIdentifier: label,
    priceInputPer1m: price,
    priceOutputPer1m: price,
    isActive: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, "At least one field is required");

export const listModelsQuerySchema = paginationQuerySchema.extend({
  isActive: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  q: z.string().trim().min(1).max(255).optional(),
});

export const modelIdSchema = z.object({ id: z.uuid() });
