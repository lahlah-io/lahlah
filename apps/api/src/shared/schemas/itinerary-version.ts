export type ItineraryVersionStop = {
  id?: string;
  position: number;
  destinationId: string | null;
  name: string;
  latitude: number;
  longitude: number;
  arrivalTime: string | null;
  departureTime?: string | null;
  visitDurationMin: number | null;
  category: string | null;
};

export type ItineraryVersionRoute = {
  fromStopId: string;
  toStopId: string;
  transportMode: string;
  geometryJson: unknown;
  provider: string | null;
  providerProfile: string | null;
  fallback: boolean;
};

/** Version payload shared by the chat flow and the itinerary version store. */
export type ItineraryVersionView = {
  versionId: string;
  versionNumber: number;
  itineraryId: string;
  travelDate: string;
  startTime: string;
  endTime: string;
  stops: ItineraryVersionStop[];
  routes?: ItineraryVersionRoute[];
  routeJson: unknown;
};

export type SaveDraftVersionInput = {
  userId: string;
  sessionId: string;
  travelDate: string;
  startTime: string;
  endTime: string;
  stops: ItineraryVersionStop[];
  routeJson: unknown;
  changeType: string;
  changeInstruction?: string | null;
  basedOnVersion?: number | null;
  sourceMessageId?: string | null;
};

export type ItineraryVersionGateway = {
  saveDraftVersion(input: SaveDraftVersionInput): Promise<ItineraryVersionView>;
  getActiveVersion(input: { userId: string; sessionId: string }): Promise<ItineraryVersionView | null>;
  selectVersion(input: { userId: string; sessionId: string; version: number }): Promise<ItineraryVersionView | null>;
};
