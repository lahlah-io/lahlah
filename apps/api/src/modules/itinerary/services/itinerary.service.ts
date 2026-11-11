import type { Prisma } from "../../../generated/prisma/client.js";
import { HttpError } from "../../../shared/http/errors.js";
import * as itineraryRepository from "../repositories/itinerary.repository.js";

type DraftStop = {
  order: number;
  destinationId: string;
  name: string;
  latitude: number;
  longitude: number;
  visitAt: string;
  durationMinutes?: number;
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
type RouteProfile = "car" | "motorcycle" | "foot";
type RouteResult = {
  source: string;
  distanceKm: number | null;
  durationMin: number | null;
  geometry: { type: "LineString"; coordinates: Array<[number, number]> };
};
type ItineraryDeps = {
  getDraft: (input: { draftId: string; userId: string; sessionId: string }) => Promise<Draft> | Draft;
  findUserById: (id: string) => Promise<UserRow | null>;
  getRoute?: (input: { points: Array<{ latitude: number; longitude: number }>; profile: RouteProfile }) => Promise<RouteResult>;
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
    async confirm(input: { draftId: string; userId: string; sessionId: string; profile?: RouteProfile }) {
      productionGate();
      await requireActiveUser(deps, input.userId);

      const existing = await itineraryRepository.findBySessionId(input.sessionId);
      if (existing && existing.userId !== input.userId) throw new HttpError(403, "FORBIDDEN", "Session access denied");
      if (existing) return { data: { ...existing, status: "final" }, created: false as const };

      const draft = await deps.getDraft(input); // checks not found/expired/ownership

      const uniqueIds = [...new Set(draft.destinations.map((d) => d.destinationId))];
      const valid = await itineraryRepository.findActivePadangDestinationIds(uniqueIds);
      if (valid.size !== uniqueIds.length) {
        throw new HttpError(422, "DESTINATION_UNAVAILABLE", "One or more destinations are unavailable");
      }

      const title = `Itinerary Padang ${draft.travelDate}`;
      const content = draft.destinations.map((d) => `${d.order}. ${d.name} (${d.visitAt})`).join("\n");
      const metadata: Record<string, unknown> = {
        date: draft.travelDate,
        startTime: draft.startTime,
        endTime: draft.endTime,
        mode: "straight_line",
        distanceType: "straight_line",
        route: draft.route as unknown,
        profile: input.profile ?? "car",
      };
      const destinations = draft.destinations.map((d) => ({
        destinationId: d.destinationId,
        visitAt: visitAtDate(draft.travelDate, d.visitAt),
        estimatedCost: null,
        notes: null,
      }));

      const stops = draft.destinations.map((d) => ({
        position: d.order,
        destinationId: d.destinationId,
        name: d.name,
        latitude: d.latitude,
        longitude: d.longitude,
        arrivalTime: d.visitAt,
        departureTime: null,
        visitDurationMin: d.durationMinutes ?? null,
        travelDurationMin: null,
        notes: null,
        category: null,
      }));

      type RouteLeg = itineraryRepository.RouteLegJson;

      const ordered = [...draft.destinations].sort((a, b) => a.order - b.order);
      const routeLegs: RouteLeg[] = [];
      let totalDistanceM: number | null = null;
      let totalDurationMin: number | null = null;
      const profile: RouteProfile = input.profile ?? "car";
      if (ordered.length >= 2) {
        for (let idx = 0; idx < ordered.length - 1; idx++) {
          const from = ordered[idx]!;
          const to = ordered[idx + 1]!;
          const straight: RouteLeg = {
            fromPosition: from.order,
            toPosition: to.order,
            transportMode: profile,
            distanceM: null,
            durationSec: null,
            geometry: {
              type: "LineString",
              coordinates: [
                [from.longitude, from.latitude],
                [to.longitude, to.latitude],
              ],
            },
            provider: "fallback",
            profile: "straight_line",
            fallback: true,
          };
          if (!deps.getRoute) {
            routeLegs.push(straight);
            continue;
          }
          try {
            const r = await deps.getRoute({
              points: [
                { latitude: from.latitude, longitude: from.longitude },
                { latitude: to.latitude, longitude: to.longitude },
              ],
              profile,
            });
            const coords =
              r.geometry && Array.isArray(r.geometry.coordinates) && r.geometry.coordinates.length >= 2
                ? r.geometry.coordinates
                : straight.geometry!.coordinates;
            if (r.source === "fallback") {
              routeLegs.push({ ...straight, geometry: { type: "LineString", coordinates: coords } });
              continue;
            }
            const distanceM = r.distanceKm != null ? Math.round(r.distanceKm * 1000) : null;
            const durationSec = r.durationMin != null ? Math.round(r.durationMin * 60) : null;
            routeLegs.push({
              fromPosition: from.order,
              toPosition: to.order,
              transportMode: profile,
              distanceM,
              durationSec,
              geometry: { type: "LineString", coordinates: coords },
              provider: r.source,
              profile,
              fallback: false,
            });
          } catch {
            routeLegs.push(straight);
          }
        }

        const distances = routeLegs.map((l) => l.distanceM).filter((v): v is number => typeof v === "number");
        const durations = routeLegs.map((l) => l.durationSec).filter((v): v is number => typeof v === "number");
        if (distances.length === routeLegs.length) totalDistanceM = distances.reduce((a, b) => a + b, 0);
        if (durations.length === routeLegs.length) totalDurationMin = Math.round(durations.reduce((a, b) => a + b, 0) / 60);
      }

      const allOsrm = routeLegs.length > 0 && routeLegs.every((l) => !l.fallback);
      const allFallback = routeLegs.length > 0 && routeLegs.every((l) => l.fallback);
      const routeMode = routeLegs.length === 0 ? "straight_line" : allOsrm ? "osrm" : allFallback ? "straight_line" : "mixed";
      const effectiveTransport = routeMode === "straight_line" ? "straight_line" : profile;
      metadata.mode = routeMode;
      metadata.distanceType = routeMode;
      metadata.profile = profile;
      const routeJson: itineraryRepository.ItineraryRouteJson = {
        type: "LineString",
        coordinates: routeLegs.flatMap((l) => l.geometry?.coordinates ?? []),
        legs: routeLegs,
      };
      metadata.route = routeLegs.length ? routeJson : (draft.route as unknown);

      try {
        const created = await itineraryRepository.createConfirmed({
          userId: input.userId,
          sessionId: input.sessionId,
          title,
          content,
          metadata: metadata as unknown as Prisma.InputJsonValue,
          tripDate: visitAtDate(draft.travelDate, "00:00"),
          transportMode: effectiveTransport,
          destinations,
          version: {
            version: 1,
            basedOnVersion: null,
            changeInstruction: null,
            changeType: "confirm",
            totalDistanceM,
            totalDurationMin,
            totalEstimatedMin: totalDurationMin,
            status: "confirmed",
            stops,
            routeJson,
          },
        });
        return { data: { ...created, status: "final" }, created: true as const };
      } catch (err) {
        const final = await itineraryRepository.findBySessionId(input.sessionId);
        if (final) return { data: { ...final, status: "final" }, created: false as const };
        throw err instanceof HttpError ? err : new HttpError(409, "CONFLICT", "Could not confirm itinerary");
      }
    },

    async getById(input: { id: string; userId: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const row = await itineraryRepository.findByIdAndUser(input.id, input.userId);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      return { data: await withCurrentVersion(row) };
    },

    async getBySession(input: { sessionId: string; userId: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const row = await itineraryRepository.findBySessionId(input.sessionId);
      if (!row || row.userId !== input.userId) {
        throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      }
      return { data: await withCurrentVersion(row) };
    },

    async listVersions(input: { id: string; userId: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const row = await itineraryRepository.findByIdAndUser(input.id, input.userId);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      return {
        data: (await itineraryRepository.listVersionSummaries(row.id)).map((v) => {
          const routeJson = v.routeJson as itineraryRepository.ItineraryRouteJson | null;
          return {
            ...v,
            stopCount: v._count.stops,
            routeCount: Array.isArray(routeJson?.legs) ? routeJson.legs.length : 0,
            _count: undefined,
          };
        }),
      };
    },

    async getVersion(input: { id: string; userId: string; version: number }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const row = await itineraryRepository.findByIdAndUser(input.id, input.userId);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const version = await itineraryRepository.getVersionSnapshot({ itineraryId: row.id, version: input.version });
      if (!version) throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
      return { data: version };
    },

    async restoreVersion(input: { id: string; userId: string; version: number; expectedVersion?: number }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const row = await itineraryRepository.findById(input.id);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      if (row.userId !== input.userId) throw new HttpError(403, "FORBIDDEN", "Itinerary access denied");

      const result = await itineraryRepository.restoreVersionTx({
        itineraryId: row.id,
        targetVersion: input.version,
        expectedVersion: input.expectedVersion,
      });
      if (!result.ok) {
        if (result.reason === "conflict") throw new HttpError(409, "VERSION_CONFLICT", "Itinerary version changed");
        if (result.reason === "version_not_found") throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
        throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      }

      const fresh = await itineraryRepository.findByIdAndUser(row.id, input.userId);
      if (!fresh) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      return { data: await withCurrentVersion(fresh) };
    },
  };

  async function withCurrentVersion(
    row: NonNullable<Awaited<ReturnType<typeof itineraryRepository.findByIdAndUser>>>,
  ) {
    const version = await itineraryRepository.getVersionSnapshot({ itineraryId: row.id, version: row.currentVersion });
    return { ...row, status: "final" as const, version };
  }
}

export type ItineraryService = ReturnType<typeof createItineraryService>;
