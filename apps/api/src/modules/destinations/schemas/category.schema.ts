import { z } from "zod";
import { paginationQuerySchema } from "../../../shared/schemas/pagination.schema.js";

const label = z.string().trim().min(1).max(255);

export const categorySlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung",
  );

export const createCategorySchema = z.object({
  name: label,
  slug: categorySlugSchema.optional(),
});

export const updateCategorySchema = z
  .object({
    name: label,
    slug: categorySlugSchema,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, "At least one field is required");

export const listCategoriesQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(255).optional(),
});

export const categoryIdSchema = z.object({ id: z.uuid() });
