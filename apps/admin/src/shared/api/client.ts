import type { ApiErrorBody } from "./types";

const DEFAULT_API_BASE_URL = "http://localhost:8787";

export const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Token sesi aktif. Disimpan di level modul supaya setiap request memakai sesi
 * yang sama tanpa perlu dioper manual. `null` berarti hanya cookie yang dikirim.
 */
let sessionToken: string | null = null;

export function setApiSessionToken(token: string | null): void {
  sessionToken = token;
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  /** `undefined` memakai token aktif, `null` memaksa request tanpa Bearer. */
  token?: string | null;
};

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, headers, token, ...init } = options;
  const bearer = token === undefined ? sessionToken : token;

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const payload = parseJson(await response.text());

  if (!response.ok) {
    const error = (payload as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? `Permintaan gagal (HTTP ${response.status})`,
    );
  }

  return payload as T;
}
