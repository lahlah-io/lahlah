import { ApiError, apiRequest } from "@/shared/api/client";
import type { DataEnvelope } from "@/shared/api/types";
import type {
  ItineraryDetailDto,
  ItineraryVersionSummaryDto,
} from "@/shared/types/itinerary-api";

const BASE = "/api/v1/itineraries";

function owner(userId: string): string {
  return `userId=${encodeURIComponent(userId)}`;
}

/** Sesi tanpa itinerary belum punya trip: API menjawab 404, bukan array kosong. */
export async function getItineraryBySession(
  userId: string,
  sessionId: string,
): Promise<ItineraryDetailDto | null> {
  try {
    const response = await apiRequest<DataEnvelope<ItineraryDetailDto>>(
      `${BASE}/by-session/${sessionId}?${owner(userId)}`,
    );
    return response.data;
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) return null;
    throw cause;
  }
}

export function listItineraryVersions(userId: string, itineraryId: string) {
  return apiRequest<DataEnvelope<ItineraryVersionSummaryDto[]>>(
    `${BASE}/${itineraryId}/versions?${owner(userId)}`,
  );
}

export function restoreItineraryVersion(
  userId: string,
  itineraryId: string,
  version: number,
  expectedVersion?: number,
) {
  return apiRequest<DataEnvelope<ItineraryDetailDto>>(
    `${BASE}/${itineraryId}/restore/${version}`,
    {
      method: "POST",
      body: expectedVersion ? { userId, expectedVersion } : { userId },
    },
  );
}
