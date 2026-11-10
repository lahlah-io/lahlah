import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";

const destinationSelect = {
  id: true,
  itineraryId: true,
  destinationId: true,
  visitAt: true,
  estimatedCost: true,
  notes: true,
  createdAt: true,
} satisfies Prisma.ItineraryDestinationSelect;

const itinerarySelect = {
  id: true,
  userId: true,
  sessionId: true,
  currentVersion: true,
  tripDate: true,
  durationDays: true,
  city: true,
  transportMode: true,
  title: true,
  content: true,
  status: true,
  isPublic: true,
  shareSlug: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  destinations: { select: destinationSelect, orderBy: { createdAt: "asc" } },
} satisfies Prisma.ItinerarySelect;

const stopSelect = {
  id: true,
  itineraryVersionId: true,
  destinationId: true,
  position: true,
  name: true,
  latitude: true,
  longitude: true,
  arrivalTime: true,
  departureTime: true,
  visitDurationMin: true,
  travelDurationMin: true,
  notes: true,
  category: true,
} satisfies Prisma.ItineraryStopSelect;

const routeSelect = {
  id: true,
  itineraryVersionId: true,
  fromStopId: true,
  toStopId: true,
  transportMode: true,
  distanceM: true,
  durationSec: true,
  geometryJson: true,
  provider: true,
  providerProfile: true,
  fallback: true,
  createdAt: true,
} satisfies Prisma.ItineraryRouteSelect;

const versionSelect = {
  id: true,
  itineraryId: true,
  version: true,
  basedOnVersion: true,
  changeInstruction: true,
  changeType: true,
  totalDistanceM: true,
  totalDurationMin: true,
  totalEstimatedMin: true,
  status: true,
  createdAt: true,
  stops: { select: stopSelect, orderBy: { position: "asc" as const } },
  routes: { select: routeSelect },
} satisfies Prisma.ItineraryVersionSelect;

export async function findByIdAndUser(id: string, userId: string) {
  return prisma.itinerary.findFirst({ where: { id, userId }, select: itinerarySelect });
}

export async function findById(id: string) {
  return prisma.itinerary.findUnique({ where: { id }, select: itinerarySelect });
}

export async function findBySessionId(sessionId: string) {
  return prisma.itinerary.findUnique({ where: { sessionId }, select: itinerarySelect });
}

export async function findActivePadangDestinationIds(ids: string[]) {
  const rows = await prisma.destination.findMany({
    where: { id: { in: ids }, city: "Padang", isActive: true },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

export async function createConfirmed(input: {
  userId: string;
  sessionId: string;
  title: string;
  content: string;
  metadata: Prisma.InputJsonValue;
  tripDate?: Date | null;
  transportMode?: string | null;
  destinations: Array<{
    destinationId: string;
    visitAt: Date | null;
    estimatedCost: number | null;
    notes: string | null;
  }>;
  version: {
    version: number;
    basedOnVersion?: number | null;
    changeInstruction?: string | null;
    changeType: string;
    totalDistanceM?: number | null;
    totalDurationMin?: number | null;
    totalEstimatedMin?: number | null;
    status: string;
    stops: SnapshotStopInput[];
    routes?: SnapshotRouteInput[];
  };
}) {
  return prisma.$transaction(async (tx) => {
    const itinerary = await tx.itinerary.create({
      data: {
        userId: input.userId,
        sessionId: input.sessionId,
        title: input.title,
        content: input.content,
        status: "confirmed",
        currentVersion: input.version.version,
        tripDate: input.tripDate ?? undefined,
        transportMode: input.transportMode ?? undefined,
        metadata: input.metadata,
      },
      select: { id: true },
    });
    if (input.destinations.length > 0) {
      await tx.itineraryDestination.createMany({
        data: input.destinations.map((d) => ({
          itineraryId: itinerary.id,
          destinationId: d.destinationId,
          visitAt: d.visitAt,
          estimatedCost: d.estimatedCost,
          notes: d.notes,
        })),
      });
    }

    const version = await tx.itineraryVersion.create({
      data: {
        itineraryId: itinerary.id,
        version: input.version.version,
        basedOnVersion: input.version.basedOnVersion ?? undefined,
        changeInstruction: input.version.changeInstruction ?? undefined,
        changeType: input.version.changeType,
        totalDistanceM: input.version.totalDistanceM ?? undefined,
        totalDurationMin: input.version.totalDurationMin ?? undefined,
        totalEstimatedMin: input.version.totalEstimatedMin ?? undefined,
        status: input.version.status,
      },
      select: { id: true },
    });

    const createdStops = [] as Array<{ id: string; position: number }>;
    for (const stop of [...input.version.stops].sort((a, b) => a.position - b.position)) {
      const row = await tx.itineraryStop.create({
        data: {
          itineraryVersionId: version.id,
          destinationId: stop.destinationId ?? undefined,
          position: stop.position,
          name: stop.name,
          latitude: stop.latitude as any,
          longitude: stop.longitude as any,
          arrivalTime: stop.arrivalTime ?? undefined,
          departureTime: stop.departureTime ?? undefined,
          visitDurationMin: stop.visitDurationMin ?? undefined,
          travelDurationMin: stop.travelDurationMin ?? undefined,
          notes: stop.notes ?? undefined,
          category: stop.category ?? undefined,
        },
        select: { id: true, position: true },
      });
      createdStops.push(row);
    }

    const stopIdByPosition = new Map(createdStops.map((s) => [s.position, s.id]));
    if (input.version.routes?.length) {
      for (const route of input.version.routes) {
        const fromStopId = route.fromStopId ?? (route.fromPosition != null ? stopIdByPosition.get(route.fromPosition) : undefined);
        const toStopId = route.toStopId ?? (route.toPosition != null ? stopIdByPosition.get(route.toPosition) : undefined);
        if (!fromStopId || !toStopId) continue;
        await tx.itineraryRoute.create({
          data: {
            itineraryVersionId: version.id,
            fromStopId,
            toStopId,
            transportMode: route.transportMode,
            distanceM: route.distanceM ?? undefined,
            durationSec: route.durationSec ?? undefined,
            geometryJson: route.geometryJson ?? undefined,
            provider: route.provider ?? undefined,
            providerProfile: route.providerProfile ?? undefined,
            fallback: route.fallback ?? false,
          },
        });
      }
    }

    await tx.itinerary.update({ where: { id: itinerary.id }, data: { currentVersion: input.version.version } });
    return tx.itinerary.findUniqueOrThrow({ where: { id: itinerary.id }, select: itinerarySelect });
  });
}

// compat alias: older callers/tests used createFinal (legacy "final" status) - now writes confirmed snapshot
export const createFinal = createConfirmed;

export type SnapshotStopInput = {
  position: number;
  destinationId?: string | null;
  name: string;
  latitude: number | string;
  longitude: number | string;
  arrivalTime?: string | null;
  departureTime?: string | null;
  visitDurationMin?: number | null;
  travelDurationMin?: number | null;
  notes?: string | null;
  category?: string | null;
};

export type SnapshotRouteInput = {
  fromStopId?: string;
  toStopId?: string;
  fromPosition?: number;
  toPosition?: number;
  transportMode: string;
  distanceM?: number | null;
  durationSec?: number | null;
  geometryJson?: Prisma.InputJsonValue | null;
  provider?: string | null;
  providerProfile?: string | null;
  fallback?: boolean;
};

export type CreateVersionSnapshotInput = {
  itineraryId: string;
  version: number;
  basedOnVersion?: number | null;
  changeInstruction?: string | null;
  changeType: string;
  totalDistanceM?: number | null;
  totalDurationMin?: number | null;
  totalEstimatedMin?: number | null;
  status: string;
  stops: SnapshotStopInput[];
  routes?: SnapshotRouteInput[];
};

export async function createVersionSnapshotTx(input: CreateVersionSnapshotInput) {
  return prisma.$transaction(async (tx) => {
    const version = await tx.itineraryVersion.create({
      data: {
        itineraryId: input.itineraryId,
        version: input.version,
        basedOnVersion: input.basedOnVersion ?? undefined,
        changeInstruction: input.changeInstruction ?? undefined,
        changeType: input.changeType,
        totalDistanceM: input.totalDistanceM ?? undefined,
        totalDurationMin: input.totalDurationMin ?? undefined,
        totalEstimatedMin: input.totalEstimatedMin ?? undefined,
        status: input.status,
      },
      select: { id: true },
    });

    const createdStops = [] as Array<{ id: string; position: number }>;
    for (const stop of [...input.stops].sort((a, b) => a.position - b.position)) {
      const row = await tx.itineraryStop.create({
        data: {
          itineraryVersionId: version.id,
          destinationId: stop.destinationId ?? undefined,
          position: stop.position,
          name: stop.name,
          latitude: stop.latitude as any,
          longitude: stop.longitude as any,
          arrivalTime: stop.arrivalTime ?? undefined,
          departureTime: stop.departureTime ?? undefined,
          visitDurationMin: stop.visitDurationMin ?? undefined,
          travelDurationMin: stop.travelDurationMin ?? undefined,
          notes: stop.notes ?? undefined,
          category: stop.category ?? undefined,
        },
        select: { id: true, position: true },
      });
      createdStops.push(row);
    }

    const stopIdByPosition = new Map(createdStops.map((s) => [s.position, s.id]));
    if (input.routes?.length) {
      for (const route of input.routes) {
        const fromStopId = route.fromStopId ?? (route.fromPosition != null ? stopIdByPosition.get(route.fromPosition) : undefined);
        const toStopId = route.toStopId ?? (route.toPosition != null ? stopIdByPosition.get(route.toPosition) : undefined);
        if (!fromStopId || !toStopId) throw new Error("createVersionSnapshotTx: route must resolve to stop ids");
        await tx.itineraryRoute.create({
          data: {
            itineraryVersionId: version.id,
            fromStopId,
            toStopId,
            transportMode: route.transportMode,
            distanceM: route.distanceM ?? undefined,
            durationSec: route.durationSec ?? undefined,
            geometryJson: route.geometryJson ?? undefined,
            provider: route.provider ?? undefined,
            providerProfile: route.providerProfile ?? undefined,
            fallback: route.fallback ?? false,
          },
        });
      }
    }

    return tx.itineraryVersion.findUniqueOrThrow({
      where: { id: version.id },
      select: versionSelect,
    });
  });
}

export async function getCurrentSnapshot(input: { itineraryId: string }) {
  const itinerary = await prisma.itinerary.findUnique({
    where: { id: input.itineraryId },
    select: {
      id: true,
      userId: true,
      sessionId: true,
      title: true,
      status: true,
      currentVersion: true,
      tripDate: true,
      durationDays: true,
      city: true,
      transportMode: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!itinerary) return null;
  const version = await prisma.itineraryVersion.findUnique({
    where: { itineraryId_version: { itineraryId: input.itineraryId, version: itinerary.currentVersion } },
    select: versionSelect,
  });
  return { ...itinerary, version };
}

export async function getVersionSnapshot(input: { itineraryId: string; version: number }) {
  return prisma.itineraryVersion.findUnique({
    where: { itineraryId_version: { itineraryId: input.itineraryId, version: input.version } },
    select: versionSelect,
  });
}

export async function listVersionSummaries(itineraryId: string) {
  return prisma.itineraryVersion.findMany({
    where: { itineraryId },
    orderBy: { version: "asc" },
    select: {
      version: true,
      basedOnVersion: true,
      changeType: true,
      changeInstruction: true,
      status: true,
      totalDistanceM: true,
      totalDurationMin: true,
      totalEstimatedMin: true,
      createdAt: true,
      _count: { select: { stops: true, routes: true } },
    },
  });
}

export type RestoreVersionResult =
  | { ok: true; version: NonNullable<Awaited<ReturnType<typeof getVersionSnapshot>>> }
  | { ok: false; reason: "not_found" | "version_not_found" | "conflict" };

/** Copies a stored snapshot into a new immutable version, guarded by optimistic concurrency. */
export async function restoreVersionTx(input: {
  itineraryId: string;
  targetVersion: number;
  expectedVersion?: number;
}): Promise<RestoreVersionResult> {
  return prisma.$transaction(async (tx) => {
    const itinerary = await tx.itinerary.findUnique({
      where: { id: input.itineraryId },
      select: { currentVersion: true },
    });
    if (!itinerary) return { ok: false, reason: "not_found" };

    const target = await tx.itineraryVersion.findUnique({
      where: { itineraryId_version: { itineraryId: input.itineraryId, version: input.targetVersion } },
      select: { id: true, version: true, stops: { select: stopSelect, orderBy: { position: "asc" } }, routes: { select: routeSelect } },
    });
    if (!target) return { ok: false, reason: "version_not_found" };

    if (input.expectedVersion != null && input.expectedVersion !== itinerary.currentVersion) {
      return { ok: false, reason: "conflict" };
    }

    const maxVersion = await tx.itineraryVersion.aggregate({
      where: { itineraryId: input.itineraryId },
      _max: { version: true },
    });
    const nextVersion = (maxVersion._max.version ?? 0) + 1;

    const created = await tx.itineraryVersion.create({
      data: {
        itineraryId: input.itineraryId,
        version: nextVersion,
        basedOnVersion: target.version,
        changeType: "restore",
        status: "confirmed",
      },
      select: { id: true },
    });

    const stopIdByPosition = new Map<number, string>();
    for (const stop of target.stops) {
      const row = await tx.itineraryStop.create({
        data: {
          itineraryVersionId: created.id,
          destinationId: stop.destinationId ?? undefined,
          position: stop.position,
          name: stop.name,
          latitude: stop.latitude,
          longitude: stop.longitude,
          arrivalTime: stop.arrivalTime ?? undefined,
          departureTime: stop.departureTime ?? undefined,
          visitDurationMin: stop.visitDurationMin ?? undefined,
          travelDurationMin: stop.travelDurationMin ?? undefined,
          notes: stop.notes ?? undefined,
          category: stop.category ?? undefined,
        },
        select: { id: true, position: true },
      });
      stopIdByPosition.set(row.position, row.id);
    }

    for (const route of target.routes) {
      const fromStopId = stopIdByPosition.get(
        target.stops.find((stop) => stop.id === route.fromStopId)?.position ?? -1,
      );
      const toStopId = stopIdByPosition.get(
        target.stops.find((stop) => stop.id === route.toStopId)?.position ?? -1,
      );
      if (!fromStopId || !toStopId) continue;
      await tx.itineraryRoute.create({
        data: {
          itineraryVersionId: created.id,
          fromStopId,
          toStopId,
          transportMode: route.transportMode,
          distanceM: route.distanceM ?? undefined,
          durationSec: route.durationSec ?? undefined,
          geometryJson: route.geometryJson ?? undefined,
          provider: route.provider ?? undefined,
          providerProfile: route.providerProfile ?? undefined,
          fallback: route.fallback,
        },
      });
    }

    const updated = await tx.itinerary.updateMany({
      where: { id: input.itineraryId, currentVersion: itinerary.currentVersion },
      data: { currentVersion: nextVersion },
    });
    if (updated.count === 0) return { ok: false, reason: "conflict" };

    const version = await tx.itineraryVersion.findUniqueOrThrow({ where: { id: created.id }, select: versionSelect });
    return { ok: true, version };
  });
}
