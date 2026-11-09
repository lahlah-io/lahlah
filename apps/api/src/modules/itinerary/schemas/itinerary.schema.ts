import { z } from "zod";

const id = z.uuid();
const userId = z.string().trim().min(1).max(255);

export const confirmItinerarySchema = z.object({
  draftId: id,
  userId,
  sessionId: id,
});

export const itineraryIdParamSchema = z.object({ id });
export const itineraryOwnerQuerySchema = z.object({ userId });
