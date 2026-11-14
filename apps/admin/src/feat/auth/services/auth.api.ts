import { apiRequest } from "@/shared/api/client";
import type { DataEnvelope } from "@/shared/api/types";
import type { AdminUser } from "../types/auth";

export type ExchangeResult = {
  user: AdminUser;
  token?: string;
  expiresAt?: string;
};

/**
 * Tukar `pid_code` sekali pakai dari popup PeridotID menjadi sesi Lahlah.
 * Header `X-Session-Mode: bearer` meminta token sesi di body untuk klien SPA.
 * `redirectUri` wajib Peridot (OAuth binding): harus sama persis dengan URL
 * tempat kode diterima — diisi `window.location.origin` pemanggil.
 */
export async function exchangePidCode(
  code: string,
  redirectUri: string,
): Promise<ExchangeResult> {
  const response = await apiRequest<DataEnvelope<ExchangeResult>>(
    "/api/v1/auth/peridot/exchange",
    {
      method: "POST",
      token: null,
      headers: { "X-Session-Mode": "bearer" },
      body: { code, redirectUri },
    },
  );
  return response.data;
}

/**
 * `token` eksplisit: `null` berarti hanya mengandalkan cookie `lahlah_session`
 * yang dikirim browser pada origin API yang sama.
 */
export async function fetchCurrentUser(
  token: string | null,
): Promise<AdminUser> {
  const response = await apiRequest<DataEnvelope<AdminUser>>(
    "/api/v1/auth/me",
    {
      token,
    },
  );
  return response.data;
}

export async function logoutSession(token: string | null): Promise<void> {
  await apiRequest<DataEnvelope<{ ok: boolean }>>("/api/v1/auth/logout", {
    method: "POST",
    token,
  });
}
