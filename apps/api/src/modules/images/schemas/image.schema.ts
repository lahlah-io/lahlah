import { z } from "zod";

export const imageQuerySchema = z.object({
  src: z
    .url()
    .max(2048)
    .refine((value) => value.startsWith("https://"), "Only https sources are supported"),
  w: z.coerce.number().int().min(200).max(1600).default(800),
});

export type ImageQuery = z.infer<typeof imageQuerySchema>;
