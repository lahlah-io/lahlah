import { env } from "../env.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const EXCHANGE_URL = "https://api.peridot.id/v1/auth/exchange";

export type PeridotIdentity = {
  pid: string;
  profile?: {
    displayName?: string | null;
    avatarUrl?: string | null;
  } | null;
  credentials?: Array<{ provider?: string; email?: string | null }> | null;
};

export class PeridotError extends Error {
  readonly status: ContentfulStatusCode;

  constructor(message: string, status: ContentfulStatusCode = 502) {
    super(message);
    this.name = "PeridotError";
    this.status = status;
  }
}

/**
 * Server-side exchange of a one-time `pid_code` for the signed-in identity.
 * The code is single-use and expires within a minute, so it must be spent
 * immediately and never logged.
 */
export async function exchangePidCode(
  code: string,
  codeVerifier?: string,
): Promise<PeridotIdentity> {
  const payload: Record<string, string> = {
    code,
    clientId: env.peridotClientId,
  };

  if (env.peridotClientSecret) {
    payload.clientSecret = env.peridotClientSecret;
  }
  if (codeVerifier) {
    payload.codeVerifier = codeVerifier;
  }

  let response: Response;
  try {
    response = await fetch(EXCHANGE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PeridotError("Could not reach PeridotID", 502);
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    const status = response.status === 429 ? 429 : 401;
    throw new PeridotError(`PeridotID rejected the code (${response.status}): ${detail}`, status);
  }

  const identity = (await response.json()) as PeridotIdentity;
  if (!identity?.pid) {
    throw new PeridotError("PeridotID returned no identity", 502);
  }
  return identity;
}

export function primaryEmail(identity: PeridotIdentity): string | null {
  return identity.credentials?.find((credential) => credential.email)?.email ?? null;
}
