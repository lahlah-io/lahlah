/** Kontrak API `/api/v1/itineraries` yang dipakai panel Trip di chat. */

export interface ItineraryStopDto {
  arrivalTime: string | null;
  category: string | null;
  destinationId: string | null;
  /** Foto destinasi dari database; null bila belum diisi admin. */
  imageUrl?: string | null;
  latitude: number;
  longitude: number;
  name: string;
  position: number;
  visitDurationMin: number | null;
}

export interface ItineraryVersionDto {
  endTime: string;
  itineraryId: string;
  startTime: string;
  stops: ItineraryStopDto[];
  travelDate: string;
  versionId: string;
  versionNumber: number;
}

export interface ItineraryDetailDto {
  currentVersion: number;
  id: string;
  sessionId: string | null;
  title: string;
  version: ItineraryVersionDto | null;
}

export interface ItineraryVersionSummaryDto {
  changeType: string;
  createdAt: string;
  isSelected: boolean;
  stopCount: number;
  version: number;
}
