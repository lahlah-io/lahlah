import { z } from "zod";

export const checkpointTripParamSchema = z.object({ tripId: z.uuid() });

export const createCheckpointSchema = z.object({
  tripDestinationId: z.uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().max(100_000).optional(),
  note: z.string().trim().max(500).optional(),
  imageUrl: z.url().max(2048).optional(),
});

/** multipart/form-data variant: every field arrives as a string. */
export const createCheckpointFormSchema = createCheckpointSchema
  .omit({ latitude: true, longitude: true, accuracyMeters: true })
  .extend({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    accuracyMeters: z.coerce.number().nonnegative().max(100_000).optional(),
  });

export type CreateCheckpointInput = z.infer<typeof createCheckpointSchema>;
export type CreateCheckpointFormInput = z.infer<typeof createCheckpointFormSchema>;
