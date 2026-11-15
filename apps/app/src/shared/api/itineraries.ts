import { ApiError, apiRequest } from "./client";
import type { DataEnvelope } from "./types";
import type { ItineraryDetailDto } from "@/shared/types/itinerary-api";

/**
 * Detail itinerary untuk anggota trip atau trip publik apa pun.
 *
 * Otorisasi dari cookie/Bearer; API membalas 404/403 untuk id yang tidak ada
 * maupun yang tidak boleh dibaca, dan keduanya dipetakan ke `null` agar
 * pemanggil cukup menangani "tidak ada".
 */
export async function getItinerary(
  itineraryId: string,
): Promise<ItineraryDetailDto | null> {
  try {
    const response = await apiRequest<DataEnvelope<ItineraryDetailDto>>(
      `/api/v1/itineraries/${itineraryId}`,
    );
    return response.data;
  } catch (cause) {
    if (
      cause instanceof ApiError &&
      (cause.status === 404 || cause.status === 403)
    ) {
      return null;
    }
    throw cause;
  }
}
