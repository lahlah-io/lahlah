import type { ContentfulStatusCode } from "hono/utils/http-status";
import { env } from "../../env.js";

const EXCHANGE_URL = "https://api.peridot.id/v1/auth/exchange";

export type PeridotIdentity = {
  pid: string;
  profile?: {
    displayName?: string | null;
    avatarUrl?: string | null;
  } | null;
  credentials?: Array<{ provider?: string; email?: string | null }> | null;
  accessToken?: string;
};

export class PeridotError extends Error {
  readonly status: ContentfulStatusCode;

  constructor(message: string, status: ContentfulStatusCode = 502) {
    super(message);
    this.name = "PeridotError";
    this.status = status;
  }
}

type ExchangeOptions = {
  codeVerifier?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Server-side exchange of a one-time `pid_code` for the signed-in identity.
 * The code is single-use, expires within minutes, and must never be logged.
 * `identity.accessToken` is read-only and must stay server-side.
 */
export async function exchangePidCode(
  code: string,
  options: ExchangeOptions = {},
): Promise<PeridotIdentity> {
  const payload: Record<string, string> = {
    code,
    clientId: env.PERIDOT_CLIENT_ID,
  };

  if (env.PERIDOT_CLIENT_SECRET) payload.clientSecret = env.PERIDOT_CLIENT_SECRET;
  if (options.codeVerifier) payload.codeVerifier = options.codeVerifier;

  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(EXCHANGE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PeridotError("Could not reach PeridotID", 502);
  }

  if (!response.ok) {
    const status: ContentfulStatusCode =
      response.status === 429 ? 429 : response.status === 401 ? 401 : 502;
    throw new PeridotError(`PeridotID rejected the code (${response.status})`, status);
  }

  let identity: PeridotIdentity;
  try {
    identity = (await response.json()) as PeridotIdentity;
  } catch {
    throw new PeridotError("PeridotID returned an invalid response", 502);
  }

  if (!identity?.pid) {
    throw new PeridotError("PeridotID returned no identity", 502);
  }
  return identity;
}

export function primaryEmail(identity: PeridotIdentity): string | null {
  const email = identity.credentials?.find((credential) => credential.email)?.email ?? null;
  return email ? email.trim().toLowerCase() : null;
}

export function displayName(identity: PeridotIdentity): string | null {
  const name = identity.profile?.displayName?.trim();
  return name ? name.slice(0, 255) : null;
}
