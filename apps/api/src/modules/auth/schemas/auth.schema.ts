import { z } from "zod";

export const exchangePidCodeSchema = z.object({
  code: z.string().trim().min(1).max(2048),
  codeVerifier: z.string().trim().min(1).max(512).optional(),
});

export type ExchangePidCodeInput = z.infer<typeof exchangePidCodeSchema>;
