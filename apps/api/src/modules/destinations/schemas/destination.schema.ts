import { z } from "zod";
import { paginationQuerySchema } from "../../../shared/schemas/pagination.schema.js";

const label = z.string().trim().min(1).max(255);

/**
 * Coordinates arrive as numbers or decimal strings and are stored in
 * `decimal(10,7)`. Output is normalised to a 7-decimal string so requests are
 * deterministic and no binary float rounding leaks into the database.
 */
const coordinate = (min: number, max: number) =>
  z
    .union([z.number().finite(), z.string().trim().regex(/^-?\d{1,3}(?:\.\d{1,7})?$/)])
    .transform((value) => Number(value))
    .pipe(z.number().min(min).max(max))
    .transform((value) => value.toFixed(7));

const description = z.string().trim().max(5000);
const address = z.string().trim().max(255);
const imageUrl = z.url().max(2048);
const details = z.record(z.string(), z.unknown());

export const createDestinationSchema = z.object({
  name: label,
  description: description.nullable().optional(),
  latitude: coordinate(-90, 90).nullable().optional(),
  longitude: coordinate(-180, 180).nullable().optional(),
  address: address.nullable().optional(),
  imageUrl: imageUrl.nullable().optional(),
  details: details.default({}),
  categoryIds: z.array(z.uuid()).default([]),
});

export const updateDestinationSchema = z
  .object({
    name: label,
    description: description.nullable(),
    latitude: coordinate(-90, 90).nullable(),
    longitude: coordinate(-180, 180).nullable(),
    address: address.nullable(),
    imageUrl: imageUrl.nullable(),
    details: details,
    categoryIds: z.array(z.uuid()),
    isActive: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, "At least one field is required");

export const listDestinationsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(255).optional(),
  source: z
    .enum(["geoapify", "firecrawl", "overpass", "wikidata", "manual", "admin", "user"])
    .optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  city: z.string().trim().min(1).optional(),
  categoryId: z.uuid().optional(),
  // Alias publik backend (`?category=`); dinormalisasi ke categoryId di service.
  category: z.uuid().optional(),
});

export const destinationIdSchema = z.object({ id: z.uuid() });
