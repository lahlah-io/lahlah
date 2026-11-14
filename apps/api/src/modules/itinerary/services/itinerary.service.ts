import { HttpError } from "../../../shared/http/errors.js";
import { env } from "../../../env.js";
import type {
  ItineraryVersionStop,
  ItineraryVersionView,
  SaveDraftVersionInput,
} from "../../../shared/schemas/itinerary-version.js";
import * as tripRepository from "../repositories/itinerary.repository.js";
import type { TripBatch, TripDestinationRow, TripRecord } from "../repositories/itinerary.repository.js";
import * as engagementRepository from "../repositories/engagement.repository.js";
import * as feedRepository from "../repositories/feed.repository.js";
import * as trendingRepository from "../repositories/trending.repository.js";
import { checkUserTripAccess } from "../repositories/trip.repository.js";

type UserRow = { id: string; isActive: boolean };
type ItineraryDeps = {
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

const FEED_COVER_WIDTH = 800;

/**
 * Cards point at the proxy when the photo host is allowlisted, so the feed does
 * not need a second resize step on the client. Other hosts are passed through raw.
 */
function feedCoverUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !env.IMAGE_PROXY_HOSTS.includes(url.hostname.toLowerCase())) {
      return raw;
    }
    return `/api/v1/images?src=${encodeURIComponent(raw)}&w=${FEED_COVER_WIDTH}`;
  } catch {
    return null;
  }
}

/** Stops of the newest version (batch = identical `createdAt`), first photo wins. */
function feedStops(row: feedRepository.FeedRow) {
  const latest = row.destinations.reduce<Date | null>(
    (max, stop) => (!max || stop.createdAt > max ? stop.createdAt : max),
    null,
  );
  if (!latest) return [];
  const seen = new Set<string>();
  return row.destinations.filter((stop) => {
    if (stop.createdAt.getTime() !== latest.getTime()) return false;
    if (seen.has(stop.destinationId)) return false;
    seen.add(stop.destinationId);
    return true;
  });
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

function hhmm(date: Date): string {
  return date.toISOString().slice(11, 16);
}

function batchTimes(batch: TripBatch | undefined) {
  const times = (batch?.rows ?? []).map((row) => row.visitAt).filter((value): value is Date => value != null);
  return {
    travelDate: times[0] ? ymd(times[0]) : "",
    startTime: times[0] ? hhmm(times[0]) : "08:00",
    endTime: times[times.length - 1] ? hhmm(times[times.length - 1]!) : "21:00",
  };
}

function totalDistance(batch: TripBatch | undefined) {
  const sum = (batch?.rows ?? []).reduce((acc, row) => acc + (row.distance ?? 0), 0);
  return sum > 0 ? Math.round(sum) : null;
}

function categorySlug(row: TripDestinationRow) {
  return row.destination.categories[0]?.category.slug ?? null;
}

function batchStops(batch: TripBatch | undefined): ItineraryVersionStop[] {
  return (batch?.rows ?? []).map((row, index) => ({
    id: row.id,
    position: index + 1,
    destinationId: row.destinationId,
    name: row.destination.name,
    latitude: Number(row.destination.latitude ?? 0),
    longitude: Number(row.destination.longitude ?? 0),
    arrivalTime: row.visitAt ? hhmm(row.visitAt) : null,
    departureTime: null,
    visitDurationMin: null,
    category: categorySlug(row),
  }));
}

function asVersionView(batch: TripBatch, times = batchTimes(batch)): ItineraryVersionView {
  return {
    versionId: batch.rows[0]?.id ?? batch.createdAt.toISOString(),
    versionNumber: batch.version,
    itineraryId: batch.rows[0]?.tripId ?? "",
    travelDate: times.travelDate,
    startTime: times.startTime,
    endTime: times.endTime,
    stops: batchStops(batch),
    routes: [],
    routeJson: null,
  };
}

/** API compatibility: shape lama /versions/:n tanpa tabel versi. */
function asVersionPayload(batch: TripBatch) {
  const anchor = batch.rows[0]?.id ?? batch.createdAt.toISOString();
  const times = batchTimes(batch);
  return {
    id: anchor,
    itineraryId: batch.rows[0]?.tripId ?? "",
    version: batch.version,
    basedOnVersion: null,
    changeInstruction: null,
    changeType: "snapshot",
    totalDistanceM: totalDistance(batch),
    totalDurationMin: null,
    totalEstimatedMin: null,
    status: "confirmed",
    sourceMessageId: null,
    routeJson: null,
    expiresAt: null,
    createdAt: batch.createdAt,
    stops: batch.rows.map((row, index) => ({
      id: row.id,
      itineraryVersionId: anchor,
      destinationId: row.destinationId,
      position: index + 1,
      name: row.destination.name,
      latitude: Number(row.destination.latitude ?? 0),
      longitude: Number(row.destination.longitude ?? 0),
      arrivalTime: row.visitAt ? hhmm(row.visitAt) : null,
      departureTime: null,
      visitDurationMin: null,
      travelDurationMin: null,
      notes: row.notes,
      category: categorySlug(row),
      snapshotJson: null,
    })),
    travelDate: times.travelDate,
    startTime: times.startTime,
    endTime: times.endTime,
  };
}

/** API compatibility: expose a trip using the legacy itinerary shape. */
function toItineraryResponse(row: TripRecord) {
  const batches = tripRepository.groupBatches(row.destinations);
  const active = batches[batches.length - 1];
  const owner = row.members[0];
  const firstVisit = active?.rows.find((item) => item.visitAt != null)?.visitAt ?? null;
  return {
    id: row.id,
    userId: owner?.userId ?? "",
    sessionId: row.chatSessionId,
    currentVersion: batches.length,
    tripDate: firstVisit,
    durationDays: 1,
    city: "Padang",
    transportMode: null,
    title: row.title,
    content: "",
    status: "final" as const,
    isPublic: row.isPublic,
    shareSlug: row.shareSlug,
    metadata: {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    destinations: (active?.rows ?? []).map((d) => ({
      id: d.id,
      itineraryId: row.id,
      destinationId: d.destinationId,
      visitAt: d.visitAt,
      estimatedCost: d.estimatedCost,
      distance: d.distance,
      notes: d.notes,
      createdAt: d.createdAt,
    })),
  };
}

function stopsToBatchStops(
  stops: SaveDraftVersionInput["stops"],
  travelDate: string,
): tripRepository.BatchStopInput[] {
  return stops
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((stop): stop is ItineraryVersionStop & { destinationId: string } => stop.destinationId != null)
    .map((stop) => ({
      destinationId: stop.destinationId,
      visitAt: stop.arrivalTime ? visitAtDate(travelDate, stop.arrivalTime) : null,
      notes: null,
    }));
}

export function createItineraryService(deps: ItineraryDeps) {
  async function withCurrentVersion(row: TripRecord, userId: string) {
    const [batches, counts] = await Promise.all([
      tripRepository.listBatches(row.id),
      engagementRepository.counts(row.id, userId),
    ]);
    const active = batches[batches.length - 1];
    return {
      ...toItineraryResponse(row),
      likeCount: counts.likeCount,
      viewCount: counts.viewCount,
      likedByMe: counts.likedByMe,
      version: active ? asVersionPayload(active) : null,
    };
  }

  async function requireTrip(tripId: string) {
    if (!(await engagementRepository.tripExists(tripId))) {
      throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
    }
  }

  return {
    async saveDraftVersion(input: SaveDraftVersionInput): Promise<ItineraryVersionView> {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const root = await tripRepository.upsertTripRoot({
        userId: input.userId,
        sessionId: input.sessionId,
        title: `Draft itinerary Padang ${input.travelDate}`,
      });
      if (!root) throw new HttpError(403, "FORBIDDEN", "Session access denied");

      const stops = stopsToBatchStops(input.stops, input.travelDate);
      if (stops.length === 0) throw new HttpError(422, "ITINERARY_EMPTY", "Itinerary has no destination");
      await tripRepository.appendBatch({ tripId: root.id, stops });

      const batches = await tripRepository.listBatches(root.id);
      const batch = batches[batches.length - 1]!;
      return asVersionView(batch, {
        travelDate: input.travelDate,
        startTime: input.startTime,
        endTime: input.endTime,
      });
    },

    async getActiveVersion(input: { userId: string; sessionId: string }): Promise<ItineraryVersionView | null> {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const root = await tripRepository.findBySessionId(input.sessionId);
      if (!root) return null;
      if (!(await checkUserTripAccess(input.userId, root.id))) return null;
      const batches = await tripRepository.listBatches(root.id);
      const batch = batches[batches.length - 1];
      return batch ? asVersionView(batch) : null;
    },

    async selectVersion(input: { userId: string; sessionId: string; version: number }): Promise<ItineraryVersionView | null> {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const root = await tripRepository.findBySessionId(input.sessionId);
      if (!root) return null;
      if (!(await checkUserTripAccess(input.userId, root.id))) return null;
      const result = await tripRepository.restoreBatch({
        tripId: root.id,
        userId: input.userId,
        targetVersion: input.version,
      });
      return result.ok ? asVersionView(result.batch) : null;
    },

    async getById(input: { id: string; userId: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      if (!(await checkUserTripAccess(input.userId, input.id))) {
        throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      }
      const row = await tripRepository.findById(input.id);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      return { data: await withCurrentVersion(row, input.userId) };
    },

    async getBySession(input: { sessionId: string; userId: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const row = await tripRepository.findBySessionId(input.sessionId);
      if (!row || !(await checkUserTripAccess(input.userId, row.id))) {
        throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      }
      return { data: await withCurrentVersion(row, input.userId) };
    },

    async listVersions(input: { id: string; userId: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      if (!(await checkUserTripAccess(input.userId, input.id))) {
        throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      }
      const row = await tripRepository.findById(input.id);
      if (!row) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      const batches = await tripRepository.listBatches(row.id);
      return {
        data: batches.map((batch) => ({
          version: batch.version,
          basedOnVersion: null,
          changeType: "snapshot",
          changeInstruction: null,
          status: "confirmed",
          totalDistanceM: totalDistance(batch),
          totalDurationMin: null,
          totalEstimatedMin: null,
          createdAt: batch.createdAt,
          stopCount: batch.rows.length,
          routeCount: 0,
          isSaved: false,
          isSelected: batch.version === batches.length,
        })),
      };
    },

    async getVersion(input: { id: string; userId: string; version: number }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      if (!(await checkUserTripAccess(input.userId, input.id))) {
        throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      }
      const batches = await tripRepository.listBatches(input.id);
      const batch = batches.find((item) => item.version === input.version);
      if (!batch) throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
      return { data: asVersionPayload(batch) };
    },

    async restoreVersion(input: { id: string; userId: string; version: number; expectedVersion?: number }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      if (!(await checkUserTripAccess(input.userId, input.id))) {
        throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      }
      const result = await tripRepository.restoreBatch({
        tripId: input.id,
        userId: input.userId,
        targetVersion: input.version,
        expectedVersion: input.expectedVersion,
      });
      if (!result.ok) {
        if (result.reason === "conflict") throw new HttpError(409, "VERSION_CONFLICT", "Itinerary version changed");
        if (result.reason === "version_not_found") throw new HttpError(404, "VERSION_NOT_FOUND", "Itinerary version not found");
        throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      }
      const fresh = await tripRepository.findById(input.id);
      if (!fresh) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      return { data: await withCurrentVersion(fresh, input.userId) };
    },

    /** Publikasi = set `isPublic` saja. Versi tidak disentuh; yang terbit adalah versi aktif. */
    async publish(input: { id: string; userId: string }) {
      const updated = await engagementRepository.setPublic({
        tripId: input.id,
        userId: input.userId,
        isPublic: true,
      });
      if (!updated) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      return { data: { id: input.id, isPublic: true } };
    },

    async unpublish(input: { id: string; userId: string }) {
      const updated = await engagementRepository.setPublic({
        tripId: input.id,
        userId: input.userId,
        isPublic: false,
      });
      if (!updated) throw new HttpError(404, "ITINERARY_NOT_FOUND", "Itinerary not found");
      return { data: { id: input.id, isPublic: false } };
    },

    async like(input: { id: string; userId: string }) {
      await requireTrip(input.id);
      await engagementRepository.like(input.userId, input.id);
      const { likeCount } = await engagementRepository.counts(input.id, input.userId);
      return { data: { liked: true, likeCount } };
    },

    async unlike(input: { id: string; userId: string }) {
      await requireTrip(input.id);
      await engagementRepository.unlike(input.userId, input.id);
      const { likeCount } = await engagementRepository.counts(input.id, input.userId);
      return { data: { liked: false, likeCount } };
    },

    async view(input: { id: string; userId: string }) {
      await requireTrip(input.id);
      const counted = await engagementRepository.recordView(input.userId, input.id);
      const { viewCount } = await engagementRepository.counts(input.id, input.userId);
      return { data: { counted, viewCount } };
    },

    /** Trending = trip publik, skor like/view/share dengan decay waktu. */
    async listTrending(input: { limit?: number } = {}) {
      const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
      return { data: await trendingRepository.listTrending(limit) };
    },

    /** Home feed: published trips, newest activity first, one card per trip. */
    async listFeed(input: { userId: string; page?: number; limit?: number }) {
      const page = Math.max(input.page ?? 1, 1);
      const limit = Math.min(Math.max(input.limit ?? 12, 1), 50);
      const { rows, total } = await feedRepository.listFeed({ page, limit });
      const liked = await feedRepository.likedTripIds(
        input.userId,
        rows.map((row) => row.id),
      );

      return {
        data: rows.map((row) => {
          const stops = feedStops(row);
          return {
            id: row.id,
            title: row.title,
            author: row.members[0]?.user ?? null,
            stopCount: stops.length,
            destinationNames: stops.map((stop) => stop.destination.name),
            coverImageUrl: feedCoverUrl(
              stops.find((stop) => stop.destination.imageUrl)?.destination.imageUrl ?? null,
            ),
            likeCount: row._count.likes,
            viewCount: row._count.views,
            likedByMe: liked.has(row.id),
            updatedAt: row.updatedAt,
          };
        }),
        meta: { page, limit, total, hasMore: page * limit < total },
      };
    },
  };
}

export type ItineraryService = ReturnType<typeof createItineraryService>;
