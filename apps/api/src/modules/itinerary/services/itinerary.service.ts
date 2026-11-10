import { HttpError } from "../../../shared/http/errors.js";
import * as itineraryRepository from "../repositories/itinerary.repository.js";

type DraftStop = {
  order: number;
  destinationId: string;
  name: string;
  latitude: number;
  longitude: number;
  visitAt: string;
};
type Draft = {
  draftId: string;
  travelDate: string;
  startTime: string;
  endTime: string;
  destinations: DraftStop[];
  route: { type: "LineString"; coordinates: [number, number][] } | null;
};
type UserRow = { id: string; isActive: boolean };
type ItineraryDeps = {
  getDraft: (input: { draftId: string; userId: string; sessionId: string }) => Promise<Draft> | Draft;
  findUserById: (id: string) => Promise<UserRow | null>;
};

function productionGate() {
  if (process.env.NODE_ENV === "production") {
    throw new HttpError(503, "AUTH_NOT_CONFIGURED", "Itinerary API is disabled until authentication is configured");
  }
}

async function requireActiveUser(deps: ItineraryDeps, userId: string) {
  const user = await deps.findUserById(userId);
  if (!user || user.isActive !== true) throw new HttpError(401, "AUTH_REQUIRED", "Active user required");
}

function visitAtDate(travelDate: string, hhmm: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(travelDate) || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  // shortcut: interpret local wall time as UTC for MVP (no TZ in draft).
  const d = new Date(`${travelDate}T${hhmm}:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function createItineraryService(deps: ItineraryDeps) {
  return {
    async confirm(input: { draftId: string; userId: string; sessionId: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);

      const existing = await itineraryRepository.findBySessionId(input.sessionId);
      if (existing && existing.userId !== input.userId) throw new HttpError(403, "FORBIDDEN", "Session access denied");
      if (existing) return { data: existing, created: false as const };

      const draft = await deps.getDraft(input); // checks not found/expired/ownership

      const uniqueIds = [...new Set(draft.destinations.map((d) => d.destinationId))];
      const valid = await itineraryRepository.findActivePadangDestinationIds(uniqueIds);
      if (valid.size !== uniqueIds.length) {
        throw new HttpError(422, "DESTINATION_UNAVAILABLE", "One or more destinations are unavailable");
      }

      const title = `Itinerary Padang ${draft.travelDate}`;
      const content = draft.destinations.map((d) => `${d.order}. ${d.name} (${d.visitAt})`).join("\n");
      const metadata = {
        date: draft.travelDate,
        startTime: draft.startTime,
        endTime: draft.endTime,
        mode: "straight_line",
        distanceType: "straight_line",
        route: draft.route,
      };
      const destinations = draft.destinations.map((d) => ({
        destinationId: d.destinationId,
        visitAt: visitAtDate(draft.travelDate, d.visitAt),
        estimatedCost: null,
        notes: null,
      }));

      try {
        const created = await itineraryRepository.createFinal({
          userId: input.userId,
          sessionId: input.sessionId,
          title,
          content,
          metadata,
          destinations,
        });
        return { data: created, created: true as const };
      } catch {
        const final = await itineraryRepository.findBySessionId(input.sessionId);
        if (final) return { data: final, created: false as const };
        throw new HttpError(409, "CONFLICT", "Could not confirm itinerary");
      }
    },

    async getById(input: { id: string; userId: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const row = await itineraryRepository.findByIdAndUser(input.id, input.userId);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      return { data: row };
    },
  };
}

export type ItineraryService = ReturnType<typeof createItineraryService>;
