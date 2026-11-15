import { ApiError, apiRequest } from "@/shared/api/client";
import type { DataEnvelope } from "@/shared/api/types";

/** Kartu feed dari `GET /api/v1/itineraries/feed` (satu trip publik). */
export interface FeedCardDto {
  author: { name: string; username: string } | null;
  coverImageUrl: string | null;
  destinationNames: string[];
  id: string;
  likeCount: number;
  likedByMe: boolean;
  stopCount: number;
  title: string;
  updatedAt: string;
  viewCount: number;
  /** Koordinat stop versi terakhir `[longitude, latitude]` untuk cover peta rute. */
  waypoints: [number, number][];
}

export interface FeedResponse {
  data: FeedCardDto[];
  meta: { hasMore: boolean; limit: number; page: number; total: number };
}

/** Trip aktif user dari `GET /api/v1/trips/active`. */
export interface ActiveTripDto {
  checked: number;
  isPublic: boolean;
  title: string;
  total: number;
  tripId: string;
  updatedAt: string;
}

const ITINERARIES = "/api/v1/itineraries";
const TRIPS = "/api/v1/trips";

export function listFeed(input: { page: number; limit: number }) {
  const params = new URLSearchParams({
    page: String(input.page),
    limit: String(input.limit),
  });
  return apiRequest<FeedResponse>(`${ITINERARIES}/feed?${params}`);
}

export function likeItinerary(tripId: string) {
  return apiRequest<DataEnvelope<{ likeCount: number; liked: boolean }>>(
    `${ITINERARIES}/${tripId}/like`,
    { method: "POST" },
  );
}

export function unlikeItinerary(tripId: string) {
  return apiRequest<DataEnvelope<{ likeCount: number; liked: boolean }>>(
    `${ITINERARIES}/${tripId}/like`,
    { method: "DELETE" },
  );
}

/** Satu tayangan per user per trip; API mengabaikan pengulangan. */
export function recordItineraryView(tripId: string) {
  return apiRequest<DataEnvelope<{ counted: boolean; viewCount: number }>>(
    `${ITINERARIES}/${tripId}/view`,
    { method: "POST" },
  );
}

/** `404 NO_ACTIVE_TRIP` berarti belum ada trip berjalan, bukan kegagalan. */
export async function getActiveTrip(): Promise<ActiveTripDto | null> {
  try {
    const response =
      await apiRequest<DataEnvelope<ActiveTripDto>>(`${TRIPS}/active`);
    return response.data;
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) return null;
    throw cause;
  }
}

export function errorMessage(cause: unknown): string {
  if (cause instanceof ApiError) return `${cause.code}: ${cause.message}`;
  return cause instanceof Error ? cause.message : "Terjadi kesalahan.";
}
