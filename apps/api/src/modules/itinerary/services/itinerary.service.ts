import type { Prisma } from "../../../generated/prisma/client.js";
import { HttpError } from "../../../shared/http/errors.js";
import type {
  ItineraryVersionView,
  SaveDraftVersionInput,
} from "../../../shared/schemas/itinerary-version.js";
import * as tripRepository from "../repositories/itinerary.repository.js";
import { checkUserTripAccess } from "../repositories/trip.repository.js";
import { deriveVersionRoutes } from "./version-routes.js";

type UserRow = { id: string; isActive: boolean };
type ItineraryDeps = {
  findUserById: (id: string) => Promise<UserRow | null>;
};

function productionGate() {
  if (process.env.NODE_ENV === "production") {
    throw new HttpError(503, "AUTH_NOT_CONFIGURED", "Itinerary API is disabled until authentication is configured");
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
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
  snapshot: NonNullable<Awaited<ReturnType<typeof tripRepository.getVersionSnapshot>>>,
  times: { travelDate: string; startTime: string; endTime: string },
): ItineraryVersionView {
  return {
    versionId: snapshot.id,
    versionNumber: snapshot.version,
    itineraryId: snapshot.tripId,
    travelDate: times.travelDate,
    startTime: times.startTime,
    endTime: times.endTime,
    stops: snapshot.stops.map((s) => ({
      id: s.id,
      position: s.position,
      destinationId: s.destinationId,
      name: s.name,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      arrivalTime: s.arrivalTime,
      departureTime: s.departureTime,
      visitDurationMin: s.visitDurationMin,
      category: s.category,
    })),
    routes: deriveVersionRoutes(snapshot.routeJson, snapshot.stops),
    routeJson: snapshot.routeJson,
  };
}

/** API compatibility: external payloads keep the legacy `itineraryId` keys. */
function asVersionPayload(snapshot: NonNullable<Awaited<ReturnType<typeof tripRepository.getVersionSnapshot>>>) {
  return {
    ...snapshot,
    itineraryId: snapshot.tripId,
    tripId: undefined,
    stops: snapshot.stops.map((s) => ({
      ...s,
      itineraryVersionId: s.tripVersionId,
      tripVersionId: undefined,
    })),
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

/** API compatibility: expose a trip using the legacy itinerary shape. */
function toItineraryResponse(row: tripRepository.TripRecord) {
  const owner = row.members.find((m) => m.role === "owner") ?? row.members[0];
  const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
  return {
    id: row.id,
    userId: owner?.userId ?? "",
    sessionId: row.sessionId,
    currentVersion: row.currentVersion,
    tripDate: row.startDate,
    durationDays: 1,
    city: "Padang",
    transportMode: typeof meta.mode === "string" ? meta.mode : null,
    title: row.title,
    content: "",
    status: "final" as const,
    isPublic: row.isPublic,
    shareSlug: row.shareSlug,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    destinations: row.destinations.map((d) => ({
      id: d.id,
      itineraryId: row.id,
      destinationId: d.destinationId,
      position: d.position,
      visitAt: d.visitAt,
      estimatedCost: d.estimatedCost,
      notes: d.notes,
      createdAt: d.createdAt,
    })),
  };
}

export function createItineraryService(deps: ItineraryDeps) {
  return {
    async saveDraftVersion(input: SaveDraftVersionInput): Promise<ItineraryVersionView> {
      productionGate();
      await requireActiveUser(deps, input.userId);
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await saveDraftVersionOnce(input);
        } catch (error) {
          if (attempt >= 1 || !isUniqueViolation(error)) throw error;
        }
      }
    },

    async getActiveVersion(input: { userId: string; sessionId: string }): Promise<ItineraryVersionView | null> {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const root = await tripRepository.findBySessionId(input.sessionId);
      if (!root) return null;
      const hasAccess = await checkUserTripAccess(input.userId, root.id);
      if (!hasAccess) return null;
      const snapshot = await tripRepository.getActiveVersionSnapshot(root.id);
      if (!snapshot) return null;
      const times = draftTimes(root.metadata);
      return asVersionView(snapshot, {
        ...times,
        travelDate: root.startDate ? ymd(root.startDate) : times.travelDate,
      });
    },

    async selectVersion(input: { userId: string; sessionId: string; version: number }): Promise<ItineraryVersionView | null> {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const root = await tripRepository.findBySessionId(input.sessionId);
      if (!root) return null;
      const hasAccess = await checkUserTripAccess(input.userId, root.id);
      if (!hasAccess) return null;
      const times = draftTimes(root.metadata);
      const travelDate = root.startDate ? ymd(root.startDate) : times.travelDate;
      const snapshot = await activateVersion({
        tripId: root.id,
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
      const hasAccess = await checkUserTripAccess(input.userId, input.id);
      if (!hasAccess) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const row = await tripRepository.findById(input.id);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const times = draftTimes(row.metadata);
      const travelDate = row.startDate ? ymd(row.startDate) : times.travelDate;
      const snapshot = await activateVersion({ tripId: row.id, userId: input.userId, version: input.version, travelDate });
      if (!snapshot) throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
      const fresh = await tripRepository.findById(row.id);
      if (!fresh) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      return { data: await withCurrentVersion(fresh) };
    },

    async publishVersion(input: { id: string; userId: string; version: number }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const hasAccess = await checkUserTripAccess(input.userId, input.id);
      if (!hasAccess) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const row = await tripRepository.findById(input.id);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const snapshot = await tripRepository.getVersionSnapshot({
        tripId: row.id,
        version: input.version,
      });
      if (!snapshot) throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
      const travelDate = row.startDate ? ymd(row.startDate) : "";
      const destinations = destinationsFromStops(snapshot.stops, travelDate);
      const published = await tripRepository.publishVersionTx({
        tripId: row.id,
        version: input.version,
        destinations,
      });
      if (!published) throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
      return { data: await withCurrentVersion(published) };
    },

    async getById(input: { id: string; userId: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const hasAccess = await checkUserTripAccess(input.userId, input.id);
      if (!hasAccess) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const row = await tripRepository.findById(input.id);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      return { data: await withCurrentVersion(row) };
    },

    async getBySession(input: { sessionId: string; userId: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const row = await tripRepository.findBySessionId(input.sessionId);
      if (!row || !(await checkUserTripAccess(input.userId, row.id))) {
        throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      }
      return { data: await withCurrentVersion(row) };
    },

    async listVersions(input: { id: string; userId: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const hasAccess = await checkUserTripAccess(input.userId, input.id);
      if (!hasAccess) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const row = await tripRepository.findById(input.id);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      return {
        data: (await tripRepository.listVersionSummaries(row.id)).map((v) => {
          const routeJson = v.routeJson as tripRepository.ItineraryRouteJson | null;
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
      const hasAccess = await checkUserTripAccess(input.userId, input.id);
      if (!hasAccess) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const row = await tripRepository.findById(input.id);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const version = await tripRepository.getVersionSnapshot({ tripId: row.id, version: input.version });
      if (!version) throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
      return { data: asVersionPayload(version) };
    },

    async setVersionSaved(input: { id: string; userId: string; version: number; isSaved: boolean }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const hasAccess = await checkUserTripAccess(input.userId, input.id);
      if (!hasAccess) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const row = await tripRepository.findById(input.id);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const snapshot = await tripRepository.setVersionSaved({
        tripId: row.id,
        version: input.version,
        isSaved: input.isSaved,
        userId: input.userId,
      });
      if (!snapshot) throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
      return { data: asVersionPayload(snapshot) };
    },

    async restoreVersion(input: { id: string; userId: string; version: number; expectedVersion?: number }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const hasAccess = await checkUserTripAccess(input.userId, input.id);
      if (!hasAccess) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const row = await tripRepository.findById(input.id);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");

      const snapshot = await tripRepository.getVersionSnapshot({
        tripId: row.id,
        version: input.version,
      });
      if (!snapshot) throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
      const travelDate = row.startDate ? ymd(row.startDate) : "";
      const destinations = destinationsFromStops(snapshot.stops, travelDate);

      const result = await tripRepository.restoreVersionTx({
        tripId: row.id,
        targetVersion: input.version,
        expectedVersion: input.expectedVersion,
        destinations,
      });
      if (!result.ok) {
        if (result.reason === "conflict") throw new HttpError(409, "VERSION_CONFLICT", "Itinerary version changed");
        if (result.reason === "version_not_found") throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
        throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      }

      const fresh = await tripRepository.findById(row.id);
      if (!fresh) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      return { data: await withCurrentVersion(fresh) };
    },
  };

  async function withCurrentVersion(row: tripRepository.TripRecord) {
    const version = await tripRepository.getActiveVersionSnapshot(row.id);
    return { ...toItineraryResponse(row), version: version ? asVersionPayload(version) : null };
  }

  function destinationsFromStops(
    stops: Array<{
      destinationId: string | null;
      position: number;
      arrivalTime: string | null;
      notes: string | null;
    }>,
    travelDate: string,
  ) {
    return stops
      .filter((s): s is typeof s & { destinationId: string } => s.destinationId != null)
      .map((s) => ({
        destinationId: s.destinationId,
        visitAt: s.arrivalTime ? visitAtDate(travelDate, s.arrivalTime) : null,
        estimatedCost: null,
        notes: s.notes,
        position: s.position,
      }));
  }

  async function activateVersion(input: {
    tripId: string;
    userId: string;
    version: number;
    travelDate: string;
  }) {
    const snapshot = await tripRepository.getVersionSnapshot({
      tripId: input.tripId,
      version: input.version,
    });
    if (!snapshot) return null;
    const destinations = destinationsFromStops(snapshot.stops, input.travelDate);
    for (let attempt = 0; ; attempt += 1) {
      try {
        const result = await tripRepository.selectVersionTx({
          tripId: input.tripId,
          userId: input.userId,
          version: input.version,
          destinations,
        });
        if (!result.ok) return null;
        return result.snapshot;
      } catch (error) {
        if (attempt >= 1 || !isUniqueViolation(error)) throw error;
      }
    }
  }

  async function saveDraftVersionOnce(input: SaveDraftVersionInput): Promise<ItineraryVersionView> {
    const metadata = {
      date: input.travelDate,
      startTime: input.startTime,
      endTime: input.endTime,
      mode: "straight_line",
      distanceType: "straight_line",
      profile: "straight_line",
    } satisfies Prisma.InputJsonObject;
    const root = await tripRepository.upsertTripRoot({
      userId: input.userId,
      sessionId: input.sessionId,
      title: `Draft itinerary Padang ${input.travelDate}`,
      metadata,
      startDate: visitAtDate(input.travelDate, "00:00"),
    });
    if (!root) throw new HttpError(403, "FORBIDDEN", "Session access denied");
    const version = await tripRepository.nextVersionNumber(root.id);
    const snapshot = await tripRepository.createVersionSnapshotTx({
      tripId: root.id,
      version,
      basedOnVersion: input.basedOnVersion ?? (version > 1 ? version - 1 : null),
      changeInstruction: input.changeInstruction ?? null,
      changeType: input.changeType,
      status: "generated",
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
  }
}

export type ItineraryService = ReturnType<typeof createItineraryService>;
