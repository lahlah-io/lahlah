import { apiRequest } from "@/shared/api/client";
import type { DataEnvelope } from "@/shared/api/types";
import type { AdminUser } from "../types/auth";

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
