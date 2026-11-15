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

/** Kartu profil dari `GET /api/v1/itineraries/mine`: trip milik user, publik atau belum. */
export interface MyTripCard {
  author: { name: string; username: string | null } | null;
  coverImageUrl: string | null;
  destinationNames: string[];
  /** Jarak jalan versi terbaru (meter); `null` bila belum ada leg berjarak. */
  distanceM: number | null;
  id: string;
  likeCount: number;
  likedByMe: boolean;
  stopCount: number;
  title: string;
  updatedAt: string;
  viewCount: number;
  /** Koordinat `[longitude, latitude]` versi terbaru untuk cover peta. */
  waypoints: [number, number][];
}

export interface MyTripsResponse {
  data: MyTripCard[];
  meta: {
    totalDistanceM: number | null;
    totalLikes: number;
    totalTrips: number;
  };
}

export function fetchMyTrips() {
  return apiRequest<MyTripsResponse>("/api/v1/itineraries/mine");
}
