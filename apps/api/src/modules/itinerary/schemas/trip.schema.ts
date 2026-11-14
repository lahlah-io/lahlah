import { z } from "zod";

export const tripIdParamSchema = z.object({ tripId: z.uuid() });
