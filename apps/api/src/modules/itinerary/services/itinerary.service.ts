import type { Prisma } from "../../../generated/prisma/client.js";
import { HttpError } from "../../../shared/http/errors.js";
import type {
  ItineraryVersionView,
  SaveDraftVersionInput,
} from "../../../shared/schemas/itinerary-version.js";
import * as itineraryRepository from "../repositories/itinerary.repository.js";
import { checkUserItineraryAccess } from "../repositories/trip.repository.js";
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

function draftTimes(metadata: unknown): { travelDate: string; startTime: string; endTime: string } {
  const meta = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>;
  return {
    travelDate: typeof meta.date === "string" ? meta.date : "",
    startTime: typeof meta.startTime === "string" ? meta.startTime : "08:00",
    endTime: typeof meta.endTime === "string" ? meta.endTime : "21:00",
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
      const root = await itineraryRepository.findBySessionId(input.sessionId);
      if (!root) return null;
      const hasAccess = await checkUserItineraryAccess(input.userId, root.id);
      if (!hasAccess) return null;
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
      if (!root) return null;
      const hasAccess = await checkUserItineraryAccess(input.userId, root.id);
      if (!hasAccess) return null;
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
      const hasAccess = await checkUserItineraryAccess(input.userId, input.id);
      if (!hasAccess) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const row = await itineraryRepository.findById(input.id);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const times = draftTimes(row.metadata);
      const travelDate = row.tripDate ? ymd(row.tripDate) : times.travelDate;
      const snapshot = await activateVersion({ itineraryId: row.id, userId: input.userId, version: input.version, travelDate });
      if (!snapshot) throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
      const fresh = await itineraryRepository.findById(row.id);
      if (!fresh) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      return { data: await withCurrentVersion(fresh) };
    },

    async publishVersion(input: { id: string; userId: string; version: number }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const hasAccess = await checkUserItineraryAccess(input.userId, input.id);
      if (!hasAccess) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const row = await itineraryRepository.findById(input.id);
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
      const hasAccess = await checkUserItineraryAccess(input.userId, input.id);
      if (!hasAccess) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const row = await itineraryRepository.findById(input.id);
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
      const hasAccess = await checkUserItineraryAccess(input.userId, input.id);
      if (!hasAccess) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const row = await itineraryRepository.findById(input.id);
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
      const hasAccess = await checkUserItineraryAccess(input.userId, input.id);
      if (!hasAccess) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const row = await itineraryRepository.findById(input.id);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const version = await itineraryRepository.getVersionSnapshot({ itineraryId: row.id, version: input.version });
      if (!version) throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
      return { data: version };
    },

    async setVersionSaved(input: { id: string; userId: string; version: number; isSaved: boolean }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const hasAccess = await checkUserItineraryAccess(input.userId, input.id);
      if (!hasAccess) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const row = await itineraryRepository.findById(input.id);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const snapshot = await itineraryRepository.setVersionSaved({
        itineraryId: row.id,
        version: input.version,
        isSaved: input.isSaved,
        userId: input.userId,
      });
      if (!snapshot) throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
      return { data: snapshot };
    },

    async restoreVersion(input: { id: string; userId: string; version: number; expectedVersion?: number }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const hasAccess = await checkUserItineraryAccess(input.userId, input.id);
      if (!hasAccess) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const row = await itineraryRepository.findById(input.id);
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

      const fresh = await itineraryRepository.findById(row.id);
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
    for (let attempt = 0; ; attempt += 1) {
      try {
        const result = await itineraryRepository.selectVersionTx({
          itineraryId: input.itineraryId,
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
