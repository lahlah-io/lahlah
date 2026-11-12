import type { Prisma } from "../../../generated/prisma/client.js";
import { HttpError } from "../../../shared/http/errors.js";
import type {
  ItineraryVersionView,
  SaveDraftVersionInput,
} from "../../../shared/schemas/itinerary-version.js";
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

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function asVersionView(
  snapshot: NonNullable<Awaited<ReturnType<typeof itineraryRepository.getVersionSnapshot>>>,
  times: { travelDate: string; startTime: string; endTime: string },
): ItineraryVersionView {
  return {
    versionId: snapshot.id,
    versionNumber: snapshot.version,
    itineraryId: snapshot.itineraryId,
    travelDate: times.travelDate,
    startTime: times.startTime,
    endTime: times.endTime,
    stops: snapshot.stops.map((s) => ({
      position: s.position,
      destinationId: s.destinationId,
      name: s.name,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      arrivalTime: s.arrivalTime,
      visitDurationMin: s.visitDurationMin,
      category: s.category,
    })),
    routeJson: snapshot.routeJson,
  };
}

function draftTimes(metadata: unknown): { travelDate: string; startTime: string; endTime: string } {
  const meta = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>;
  return {
    travelDate: typeof meta.date === "string" ? meta.date : "",
    startTime: typeof meta.startTime === "string" ? meta.startTime : "08:00",
    endTime: typeof meta.endTime === "string" ? meta.endTime : "21:00",
  };
}

async function resolveDraftVersion(input: { draftId: string; userId: string; sessionId: string }) {
  const row = await itineraryRepository.findVersionById(input.draftId);
  if (!row) return null;
  if (row.itinerary.userId !== input.userId || row.itinerary.sessionId !== input.sessionId) return null;
  if (row.status !== "draft") return null;
  if (row.version !== row.itinerary.currentVersion) return null;
  const times = draftTimes(row.itinerary.metadata);
  const travelDate = row.itinerary.tripDate ? ymd(row.itinerary.tripDate) : times.travelDate || ymd(new Date());
  const draft: Draft = {
    draftId: row.id,
    travelDate,
    startTime: times.startTime,
    endTime: times.endTime,
    destinations: row.stops
      .filter((s): s is typeof s & { destinationId: string } => s.destinationId != null)
      .map((s) => ({
        order: s.position,
        destinationId: s.destinationId,
        name: s.name,
        latitude: Number(s.latitude),
        longitude: Number(s.longitude),
        visitAt: s.arrivalTime ?? "00:00",
        durationMinutes: s.visitDurationMin ?? undefined,
      })),
    route: null,
  };
  return { versionId: row.id, versionNumber: row.version, itineraryId: row.itineraryId, draft };
}

export function createItineraryService(deps: ItineraryDeps) {
  return {
    async confirm(input: { draftId: string; userId: string; sessionId: string; profile?: RouteProfile }) {
      productionGate();
      await requireActiveUser(deps, input.userId);

      const existing = await itineraryRepository.findBySessionId(input.sessionId);
      if (existing && existing.userId !== input.userId) throw new HttpError(403, "FORBIDDEN", "Session access denied");
      if (existing && existing.status !== "draft") return { data: { ...existing, status: "final" }, created: false as const };

      const draftVersion = await resolveDraftVersion(input);
      const draft = draftVersion ? draftVersion.draft : await deps.getDraft(input); // checks not found/expired/ownership

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
        position: d.order,
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
        if (draftVersion) {
          const created = await itineraryRepository.confirmVersionTx({
            itineraryId: draftVersion.itineraryId,
            versionId: draftVersion.versionId,
            version: draftVersion.versionNumber,
            metadata: metadata as unknown as Prisma.InputJsonValue,
            routeJson: routeJson as unknown as Prisma.InputJsonValue,
            destinations,
          });
          return { data: { ...created, status: "final" }, created: true as const };
        }
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

    async saveDraftVersion(input: SaveDraftVersionInput): Promise<ItineraryVersionView> {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const root = await itineraryRepository.upsertDraftRoot({
        userId: input.userId,
        sessionId: input.sessionId,
        title: `Draft itinerary Padang ${input.travelDate}`,
        content: input.stops.map((s) => `${s.position}. ${s.name} (${s.arrivalTime ?? "-"})`).join("\n"),
        metadata: {
          date: input.travelDate,
          startTime: input.startTime,
          endTime: input.endTime,
          mode: "straight_line",
          distanceType: "straight_line",
          profile: "straight_line",
        },
        tripDate: visitAtDate(input.travelDate, "00:00"),
        transportMode: "straight_line",
      });
      if (!root) throw new HttpError(403, "FORBIDDEN", "Session access denied");
      const version = await itineraryRepository.nextVersionNumber(root.id);
      const snapshot = await itineraryRepository.createVersionSnapshotTx({
        itineraryId: root.id,
        version,
        basedOnVersion: input.basedOnVersion ?? (version > 1 ? version - 1 : null),
        changeInstruction: input.changeInstruction ?? null,
        changeType: input.changeType,
        status: "draft",
        sourceMessageId: input.sourceMessageId ?? null,
        routeJson: input.routeJson as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        stops: input.stops.map((s) => ({
          position: s.position,
          destinationId: s.destinationId,
          name: s.name,
          latitude: s.latitude,
          longitude: s.longitude,
          arrivalTime: s.arrivalTime,
          visitDurationMin: s.visitDurationMin,
          category: s.category,
        })),
      });
      return asVersionView(snapshot, {
        travelDate: input.travelDate,
        startTime: input.startTime,
        endTime: input.endTime,
      });
    },

    async getActiveVersion(input: { userId: string; sessionId: string }): Promise<ItineraryVersionView | null> {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const root = await itineraryRepository.findBySessionId(input.sessionId);
      if (!root || root.userId !== input.userId) return null;
      const snapshot = await itineraryRepository.getCurrentSnapshot({ itineraryId: root.id });
      if (!snapshot?.version) return null;
      const times = draftTimes(root.metadata);
      return asVersionView(snapshot.version, {
        ...times,
        travelDate: root.tripDate ? ymd(root.tripDate) : times.travelDate,
      });
    },

    async selectVersion(input: { userId: string; sessionId: string; version: number }): Promise<ItineraryVersionView | null> {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const root = await itineraryRepository.findBySessionId(input.sessionId);
      if (!root || root.userId !== input.userId) return null;
      const times = draftTimes(root.metadata);
      const travelDate = root.tripDate ? ymd(root.tripDate) : times.travelDate;
      const snapshot = await activateVersion({
        itineraryId: root.id,
        userId: input.userId,
        version: input.version,
        travelDate,
      });
      if (!snapshot) return null;
      return asVersionView(snapshot, { ...times, travelDate });
    },

    async selectVersionById(input: { id: string; userId: string; version: number }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const row = await itineraryRepository.findByIdAndUser(input.id, input.userId);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const times = draftTimes(row.metadata);
      const travelDate = row.tripDate ? ymd(row.tripDate) : times.travelDate;
      const snapshot = await activateVersion({ itineraryId: row.id, userId: input.userId, version: input.version, travelDate });
      if (!snapshot) throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
      const fresh = await itineraryRepository.findByIdAndUser(row.id, input.userId);
      if (!fresh) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      return { data: await withCurrentVersion(fresh) };
    },

    async publishVersion(input: { id: string; userId: string; version: number }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const row = await itineraryRepository.findByIdAndUser(input.id, input.userId);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const snapshot = await itineraryRepository.getVersionSnapshot({
        itineraryId: row.id,
        version: input.version,
      });
      if (!snapshot) throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
      const travelDate = row.tripDate ? ymd(row.tripDate) : "";
      const destinations = snapshot.stops
        .filter((s): s is typeof s & { destinationId: string } => s.destinationId != null)
        .map((s) => ({
          destinationId: s.destinationId,
          visitAt: s.arrivalTime ? visitAtDate(travelDate, s.arrivalTime) : null,
          estimatedCost: null,
          notes: s.notes,
          position: s.position,
        }));
      const published = await itineraryRepository.publishVersionTx({
        itineraryId: row.id,
        version: input.version,
        destinations,
      });
      if (!published) throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
      return { data: await withCurrentVersion(published) };
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

      const snapshot = await itineraryRepository.getVersionSnapshot({
        itineraryId: row.id,
        version: input.version,
      });
      if (!snapshot) throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
      const travelDate = row.tripDate ? ymd(row.tripDate) : "";
      const destinations = snapshot.stops
        .filter((s): s is typeof s & { destinationId: string } => s.destinationId != null)
        .map((s) => ({
          destinationId: s.destinationId,
          visitAt: s.arrivalTime ? visitAtDate(travelDate, s.arrivalTime) : null,
          estimatedCost: null,
          notes: s.notes,
          position: s.position,
        }));

      const result = await itineraryRepository.restoreVersionTx({
        itineraryId: row.id,
        targetVersion: input.version,
        expectedVersion: input.expectedVersion,
        destinations,
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
    const version = await itineraryRepository.getActiveVersionSnapshot(row.id);
    return { ...row, status: "final" as const, version };
  }

  async function activateVersion(input: {
    itineraryId: string;
    userId: string;
    version: number;
    travelDate: string;
  }) {
    const snapshot = await itineraryRepository.getVersionSnapshot({
      itineraryId: input.itineraryId,
      version: input.version,
    });
    if (!snapshot) return null;
    const destinations = snapshot.stops
      .filter((s): s is typeof s & { destinationId: string } => s.destinationId != null)
      .map((s) => ({
        destinationId: s.destinationId,
        visitAt: s.arrivalTime ? visitAtDate(input.travelDate, s.arrivalTime) : null,
        estimatedCost: null,
        notes: s.notes,
        position: s.position,
      }));
    const result = await itineraryRepository.selectVersionTx({
      itineraryId: input.itineraryId,
      userId: input.userId,
      version: input.version,
      destinations,
    });
    if (!result.ok) return null;
    return result.snapshot;
  }
}

export type ItineraryService = ReturnType<typeof createItineraryService>;
