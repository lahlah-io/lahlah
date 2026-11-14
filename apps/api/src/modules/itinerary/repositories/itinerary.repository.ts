import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";
import { ensureTripForSessionTx } from "./trip.repository.js";
import { recordActivityLog } from "./activity-log.repository.js";

const destinationSelect = {
  id: true,
  tripId: true,
  destinationId: true,
  position: true,
  isActive: true,
  visitAt: true,
  estimatedCost: true,
  notes: true,
  createdAt: true,
} satisfies Prisma.TripDestinationSelect;

const tripSelect = {
  id: true,
  sessionId: true,
  currentVersion: true,
  startDate: true,
  title: true,
  isPublic: true,
  shareSlug: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  members: { select: { userId: true, role: true } },
  destinations: {
    where: { isActive: true },
    select: destinationSelect,
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.TripSelect;

export type TripRecord = Prisma.TripGetPayload<{ select: typeof tripSelect }>;

const stopSelect = {
  id: true,
  tripVersionId: true,
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
  snapshotJson: true,
} satisfies Prisma.TripStopSelect;

const versionSelect = {
  id: true,
  tripId: true,
  version: true,
  basedOnVersion: true,
  changeInstruction: true,
  changeType: true,
  totalDistanceM: true,
  totalDurationMin: true,
  totalEstimatedMin: true,
  status: true,
  isSaved: true,
  isSelected: true,
  sourceMessageId: true,
  routeJson: true,
  expiresAt: true,
  createdAt: true,
  stops: { select: stopSelect, orderBy: { position: "asc" as const } },
} satisfies Prisma.TripVersionSelect;

export type TripVersionRecord = Prisma.TripVersionGetPayload<{ select: typeof versionSelect }>;

export type RouteLegJson = {
  fromPosition: number;
  toPosition: number;
  transportMode: string;
  distanceM: number | null;
  durationSec: number | null;
  geometry: { type: "LineString"; coordinates: Array<[number, number]> } | null;
  provider: string | null;
  profile: string | null;
  fallback: boolean;
};

export type ItineraryRouteJson = {
  type: "LineString";
  coordinates: Array<[number, number]>;
  legs: RouteLegJson[];
};

export async function findById(id: string) {
  return prisma.trip.findUnique({ where: { id }, select: tripSelect });
}

export async function findBySessionId(sessionId: string) {
  return prisma.trip.findUnique({ where: { sessionId }, select: tripSelect });
}

export async function upsertTripRoot(input: {
  userId: string;
  sessionId: string;
  title: string;
  metadata: Prisma.InputJsonValue;
  startDate?: Date | null;
}) {
  return prisma.$transaction(async (tx) => {
    const trip = await ensureTripForSessionTx(tx, {
      sessionId: input.sessionId,
      userId: input.userId,
      title: input.title,
      startDate: input.startDate,
      metadata: input.metadata,
    });
    if (!trip) return null;

    await tx.trip.update({
      where: { id: trip.id },
      data: { title: input.title, metadata: input.metadata, startDate: input.startDate ?? undefined },
    });
    return { id: trip.id, currentVersion: trip.currentVersion };
  });
}

export type SelectVersionResult =
  | { ok: true; snapshot: TripVersionRecord }
  | { ok: false; reason: "not_found" | "version_not_found" };

export async function selectVersionTx(input: {
  tripId: string;
  userId: string;
  version: number;
  destinations: ActiveDestinationInput[];
}): Promise<SelectVersionResult> {
  return prisma.$transaction(async (tx) => {
    const member = await tx.userTrip.findUnique({
      where: { userId_tripId: { userId: input.userId, tripId: input.tripId } },
      select: { id: true },
    });
    if (!member) return { ok: false, reason: "not_found" };

    const target = await tx.tripVersion.findUnique({
      where: { tripId_version: { tripId: input.tripId, version: input.version } },
      select: { id: true },
    });
    if (!target) return { ok: false, reason: "version_not_found" };

    await tx.tripVersion.updateMany({
      where: { tripId: input.tripId, isSelected: true, id: { not: target.id } },
      data: { isSelected: false },
    });
    await tx.tripVersion.update({ where: { id: target.id }, data: { isSelected: true } });
    await syncActiveDestinations(tx, {
      tripId: input.tripId,
      destinations: input.destinations,
    });
    await tx.trip.update({
      where: { id: input.tripId },
      data: { currentVersion: input.version },
    });
    await recordActivityLog(tx, {
      userId: input.userId,
      action: "version_selected",
      entityType: "trip_version",
      entityId: target.id,
    });

    const snapshot = await tx.tripVersion.findUniqueOrThrow({
      where: { id: target.id },
      select: versionSelect,
    });
    return { ok: true as const, snapshot };
  });
}

export type ActiveDestinationInput = {
  destinationId: string;
  visitAt: Date | null;
  estimatedCost: number | null;
  notes: string | null;
  position: number | null;
};

/**
 * Sets the active destination set without deleting rows, so destination
 * checkpoints stay attached to the destination they were recorded on.
 * shortcut: one stop per destination per trip; duplicate destination stops collapse into one row.
 */
async function syncActiveDestinations(
  tx: Prisma.TransactionClient,
  input: { tripId: string; destinations: ActiveDestinationInput[] },
) {
  const existing = await tx.tripDestination.findMany({
    where: { tripId: input.tripId },
    select: { id: true, destinationId: true },
    orderBy: { createdAt: "asc" },
  });
  const byDestination = new Map<string, string>();
  for (const row of existing) {
    if (!byDestination.has(row.destinationId)) byDestination.set(row.destinationId, row.id);
  }

  const keep: string[] = [];
  const keptIds: string[] = [];
  for (const destination of input.destinations) {
    if (keep.includes(destination.destinationId)) continue;
    keep.push(destination.destinationId);
    const id = byDestination.get(destination.destinationId);
    if (id) {
      await tx.tripDestination.update({
        where: { id },
        data: {
          visitAt: destination.visitAt,
          estimatedCost: destination.estimatedCost,
          notes: destination.notes,
          position: destination.position,
          isActive: true,
        },
      });
      keptIds.push(id);
      continue;
    }
    const created = await tx.tripDestination.create({
      data: { tripId: input.tripId, ...destination, isActive: true },
      select: { id: true },
    });
    byDestination.set(destination.destinationId, created.id);
    keptIds.push(created.id);
  }

  await tx.tripDestination.updateMany({
    where: { tripId: input.tripId, isActive: true, id: { notIn: keptIds } },
    data: { isActive: false },
  });
}

export async function publishVersionTx(input: {
  tripId: string;
  version: number;
  destinations: ActiveDestinationInput[];
}) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.tripVersion.findUnique({
      where: { tripId_version: { tripId: input.tripId, version: input.version } },
      select: { id: true },
    });
    if (!target) return null;
    await syncActiveDestinations(tx, {
      tripId: input.tripId,
      destinations: input.destinations,
    });
    return tx.trip.update({
      where: { id: input.tripId },
      data: { currentVersion: input.version },
      select: tripSelect,
    });
  });
}

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
  snapshotJson?: Prisma.InputJsonValue | null;
};

export type CreateVersionSnapshotInput = {
  tripId: string;
  version: number;
  basedOnVersion?: number | null;
  changeInstruction?: string | null;
  changeType: string;
  totalDistanceM?: number | null;
  totalDurationMin?: number | null;
  totalEstimatedMin?: number | null;
  status: string;
  sourceMessageId?: string | null;
  routeJson?: Prisma.InputJsonValue | null;
  expiresAt?: Date | null;
  stops: SnapshotStopInput[];
};

export async function createVersionSnapshotTx(input: CreateVersionSnapshotInput) {
  return prisma.$transaction(async (tx) => {
    const version = await tx.tripVersion.create({
      data: {
        tripId: input.tripId,
        version: input.version,
        basedOnVersion: input.basedOnVersion ?? undefined,
        changeInstruction: input.changeInstruction ?? undefined,
        changeType: input.changeType,
        totalDistanceM: input.totalDistanceM ?? undefined,
        totalDurationMin: input.totalDurationMin ?? undefined,
        totalEstimatedMin: input.totalEstimatedMin ?? undefined,
        status: input.status,
        sourceMessageId: input.sourceMessageId ?? undefined,
        routeJson: input.routeJson ?? undefined,
        expiresAt: input.expiresAt ?? undefined,
      },
      select: { id: true },
    });

    for (const stop of [...input.stops].sort((a, b) => a.position - b.position)) {
      await tx.tripStop.create({
        data: {
          tripVersionId: version.id,
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
          snapshotJson: stop.snapshotJson ?? undefined,
        },
        select: { id: true, position: true },
      });
    }

    await tx.trip.update({
      where: { id: input.tripId },
      data: { currentVersion: input.version },
    });

    return tx.tripVersion.findUniqueOrThrow({
      where: { id: version.id },
      select: versionSelect,
    });
  });
}

export async function getActiveVersionSnapshot(tripId: string) {
  const selected = await prisma.tripVersion.findFirst({
    where: { tripId, isSelected: true },
    select: versionSelect,
  });
  if (selected) return selected;
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { currentVersion: true },
  });
  if (!trip) return null;
  return getVersionSnapshot({ tripId, version: trip.currentVersion });
}

export async function nextVersionNumber(tripId: string) {
  const row = await prisma.tripVersion.aggregate({
    where: { tripId },
    _max: { version: true },
  });
  return (row._max.version ?? 0) + 1;
}

export async function getVersionSnapshot(input: { tripId: string; version: number }) {
  return prisma.tripVersion.findUnique({
    where: { tripId_version: { tripId: input.tripId, version: input.version } },
    select: versionSelect,
  });
}

export async function setVersionSaved(input: { tripId: string; version: number; isSaved: boolean; userId?: string }) {
  const row = await prisma.tripVersion.findUnique({
    where: { tripId_version: { tripId: input.tripId, version: input.version } },
    select: { id: true },
  });
  if (!row) return null;
  const snapshot = await prisma.tripVersion.update({
    where: { id: row.id },
    data: { isSaved: input.isSaved },
    select: versionSelect,
  });
  if (input.userId) {
    await recordActivityLog(prisma, {
      userId: input.userId,
      action: input.isSaved ? "version_saved" : "version_unsaved",
      entityType: "trip_version",
      entityId: row.id,
    });
  }
  return snapshot;
}

export async function listVersionSummaries(tripId: string) {
  return prisma.tripVersion.findMany({
    where: { tripId },
    orderBy: { version: "asc" },
    select: {
      version: true,
      basedOnVersion: true,
      changeType: true,
      changeInstruction: true,
      status: true,
      isSaved: true,
      isSelected: true,
      totalDistanceM: true,
      totalDurationMin: true,
      totalEstimatedMin: true,
      routeJson: true,
      createdAt: true,
      _count: { select: { stops: true } },
    },
  });
}

export type RestoreVersionResult =
  | { ok: true; version: NonNullable<Awaited<ReturnType<typeof getVersionSnapshot>>> }
  | { ok: false; reason: "not_found" | "version_not_found" | "conflict" };

/** Copies a stored snapshot into a new immutable version, guarded by optimistic concurrency. */
export async function restoreVersionTx(input: {
  tripId: string;
  targetVersion: number;
  expectedVersion?: number;
  destinations: ActiveDestinationInput[];
}): Promise<RestoreVersionResult> {
  return prisma.$transaction(async (tx) => {
    const trip = await tx.trip.findUnique({
      where: { id: input.tripId },
      select: { currentVersion: true },
    });
    if (!trip) return { ok: false, reason: "not_found" };

    const target = await tx.tripVersion.findUnique({
      where: { tripId_version: { tripId: input.tripId, version: input.targetVersion } },
      select: {
        id: true,
        version: true,
        routeJson: true,
        stops: { select: stopSelect, orderBy: { position: "asc" } },
      },
    });
    if (!target) return { ok: false, reason: "version_not_found" };

    if (input.expectedVersion != null && input.expectedVersion !== trip.currentVersion) {
      return { ok: false, reason: "conflict" };
    }

    const maxVersion = await tx.tripVersion.aggregate({
      where: { tripId: input.tripId },
      _max: { version: true },
    });
    const nextVersion = (maxVersion._max.version ?? 0) + 1;

    const updated = await tx.trip.updateMany({
      where: { id: input.tripId, currentVersion: trip.currentVersion },
      data: { currentVersion: nextVersion },
    });
    if (updated.count === 0) return { ok: false, reason: "conflict" };

    const created = await tx.tripVersion.create({
      data: {
        tripId: input.tripId,
        version: nextVersion,
        basedOnVersion: target.version,
        changeType: "restore",
        status: "confirmed",
        routeJson: target.routeJson ?? undefined,
      },
      select: { id: true },
    });

    for (const stop of target.stops) {
      await tx.tripStop.create({
        data: {
          tripVersionId: created.id,
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
          snapshotJson: stop.snapshotJson ?? undefined,
        },
        select: { id: true, position: true },
      });
    }

    await tx.tripVersion.updateMany({
      where: { tripId: input.tripId, isSelected: true, id: { not: created.id } },
      data: { isSelected: false },
    });
    await tx.tripVersion.update({ where: { id: created.id }, data: { isSelected: true } });
    await syncActiveDestinations(tx, {
      tripId: input.tripId,
      destinations: input.destinations,
    });

    const version = await tx.tripVersion.findUniqueOrThrow({ where: { id: created.id }, select: versionSelect });
    return { ok: true, version };
  });
}
