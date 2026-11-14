import { apiRequest } from "@/shared/api/client";
import type { DataEnvelope } from "@/shared/api/types";

export type Profile = {
  id: string;
  name: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
};

export type UpdateProfileInput = {
  name?: string;
  username?: string;
  bio?: string | null;
  avatarUrl?: string | null;
};

export async function updateMyProfile(input: UpdateProfileInput): Promise<Profile> {
  const response = await apiRequest<DataEnvelope<Profile>>("/api/v1/users/me", {
    method: "PATCH",
    body: input,
  });
  return response.data;
}
