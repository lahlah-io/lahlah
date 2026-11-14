import { z } from "zod";

const id = z.uuid();
const userId = z.string().trim().min(1).max(255);

export const itineraryIdParamSchema = z.object({ id });
export const itineraryOwnerQuerySchema = z.object({ userId });
export const itinerarySessionParamSchema = z.object({ sessionId: id });
export const itineraryVersionParamSchema = z.object({
  id,
  version: z.coerce.number().int().min(1),
});
export const restoreItineraryVersionSchema = z.object({
  userId,
  expectedVersion: z.number().int().min(1).optional(),
});
