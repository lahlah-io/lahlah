import { z } from "zod";
import { paginationQuerySchema } from "../../../shared/schemas/pagination.schema.js";

export const listDestinationsQuerySchema = paginationQuerySchema.extend({
  city: z.string().trim().min(1).optional(),
  category: z.uuid().optional(),
});

export const destinationIdSchema = z.object({ id: z.uuid() });
