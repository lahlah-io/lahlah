import { z } from "zod";

export const exchangePidCodeSchema = z.object({
  code: z.string().trim().min(1).max(2048),
  codeVerifier: z.string().trim().min(1).max(512).optional(),
  redirectUri: z.string().trim().min(1).max(2048),
});

export type ExchangePidCodeInput = z.infer<typeof exchangePidCodeSchema>;
