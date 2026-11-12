import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";

const destinationSelect = {
  id: true,
  itineraryId: true,
  destinationId: true,
  position: true,
  isActive: true,
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
  destinations: {
    where: { isActive: true },
    select: destinationSelect,
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  },
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
  snapshotJson: true,
} satisfies Prisma.ItineraryStopSelect;

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
  isSaved: true,
  isSelected: true,
  sourceMessageId: true,
  routeJson: true,
  expiresAt: true,
  createdAt: true,
  stops: { select: stopSelect, orderBy: { position: "asc" as const } },
} satisfies Prisma.ItineraryVersionSelect;

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

export async function upsertDraftRoot(input: {
  userId: string;
  sessionId: string;
  title: string;
  content: string;
  metadata: Prisma.InputJsonValue;
  tripDate?: Date | null;
  transportMode?: string | null;
}) {
  const existing = await prisma.itinerary.findUnique({
    where: { sessionId: input.sessionId },
    select: { id: true, userId: true },
  });
  if (existing) {
    if (existing.userId !== input.userId) return null;
    return prisma.itinerary.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        content: input.content,
        metadata: input.metadata,
        tripDate: input.tripDate ?? undefined,
        transportMode: input.transportMode ?? undefined,
      },
      select: { id: true, currentVersion: true },
    });
  }
  return prisma.itinerary.create({
    data: {
      userId: input.userId,
      sessionId: input.sessionId,
      title: input.title,
      content: input.content,
      metadata: input.metadata,
      status: "draft",
      tripDate: input.tripDate ?? undefined,
      transportMode: input.transportMode ?? undefined,
    },
    select: { id: true, currentVersion: true },
  });
}

export async function findVersionById(versionId: string) {
  return prisma.itineraryVersion.findUnique({
    where: { id: versionId },
    select: {
      ...versionSelect,
      itinerary: {
        select: { userId: true, sessionId: true, tripDate: true, currentVersion: true, metadata: true, status: true },
      },
    },
  });
}

export type SelectVersionResult =
  | { ok: true; snapshot: NonNullable<Awaited<ReturnType<typeof getVersionSnapshot>>> }
  | { ok: false; reason: "not_found" | "version_not_found" };

export async function selectVersionTx(input: {
  itineraryId: string;
  userId: string;
  version: number;
  destinations: ActiveDestinationInput[];
}): Promise<SelectVersionResult> {
  return prisma.$transaction(async (tx) => {
    const itinerary = await tx.itinerary.findFirst({
      where: { id: input.itineraryId, userId: input.userId },
      select: { id: true },
    });
    if (!itinerary) return { ok: false, reason: "not_found" };

    const target = await tx.itineraryVersion.findUnique({
      where: { itineraryId_version: { itineraryId: input.itineraryId, version: input.version } },
      select: { id: true },
    });
    if (!target) return { ok: false, reason: "version_not_found" };

    await tx.itineraryVersion.updateMany({
      where: { itineraryId: input.itineraryId, isSelected: true, id: { not: target.id } },
      data: { isSelected: false },
    });
    await tx.itineraryVersion.update({ where: { id: target.id }, data: { isSelected: true } });
    await syncActiveDestinations(tx, {
      itineraryId: input.itineraryId,
      destinations: input.destinations,
    });
    await tx.itinerary.update({
      where: { id: input.itineraryId },
      data: { currentVersion: input.version, status: "confirmed" },
    });

    const snapshot = await tx.itineraryVersion.findUniqueOrThrow({
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
 * shortcut: one stop per destination per version; duplicate destination stops collapse into one row.
 */
async function syncActiveDestinations(
  tx: Prisma.TransactionClient,
  input: { itineraryId: string; destinations: ActiveDestinationInput[] },
) {
  const existing = await tx.itineraryDestination.findMany({
    where: { itineraryId: input.itineraryId },
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
      await tx.itineraryDestination.update({
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
    const created = await tx.itineraryDestination.create({
      data: { itineraryId: input.itineraryId, ...destination, isActive: true },
      select: { id: true },
    });
    byDestination.set(destination.destinationId, created.id);
    keptIds.push(created.id);
  }

  await tx.itineraryDestination.updateMany({
    where: { itineraryId: input.itineraryId, isActive: true, id: { notIn: keptIds } },
    data: { isActive: false },
  });
}

export async function confirmVersionTx(input: {
  itineraryId: string;
  versionId: string;
  version: number;
  metadata: Prisma.InputJsonValue;
  routeJson: Prisma.InputJsonValue;
  destinations: Array<{
    destinationId: string;
    visitAt: Date | null;
    estimatedCost: number | null;
    notes: string | null;
    position: number | null;
  }>;
}) {
  return prisma.$transaction(async (tx) => {
    await syncActiveDestinations(tx, {
      itineraryId: input.itineraryId,
      destinations: input.destinations,
    });
    await tx.itineraryVersion.update({
      where: { id: input.versionId },
      data: { status: "confirmed", changeType: "confirm", routeJson: input.routeJson },
    });
    return tx.itinerary.update({
      where: { id: input.itineraryId },
      data: { status: "confirmed", currentVersion: input.version, metadata: input.metadata },
      select: itinerarySelect,
    });
  });
}

export async function publishVersionTx(input: {
  itineraryId: string;
  version: number;
  destinations: Array<{
    destinationId: string;
    visitAt: Date | null;
    estimatedCost: number | null;
    notes: string | null;
    position: number | null;
  }>;
}) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.itineraryVersion.findUnique({
      where: { itineraryId_version: { itineraryId: input.itineraryId, version: input.version } },
      select: { id: true },
    });
    if (!target) return null;
    await syncActiveDestinations(tx, {
      itineraryId: input.itineraryId,
      destinations: input.destinations,
    });
    return tx.itinerary.update({
      where: { id: input.itineraryId },
      data: { currentVersion: input.version },
      select: itinerarySelect,
    });
  });
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
    position: number | null;
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
    sourceMessageId?: string | null;
    routeJson?: Prisma.InputJsonValue | null;
    expiresAt?: Date | null;
    stops: SnapshotStopInput[];
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
    await syncActiveDestinations(tx, {
      itineraryId: itinerary.id,
      destinations: input.destinations,
    });

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
        sourceMessageId: input.version.sourceMessageId ?? undefined,
        routeJson: input.version.routeJson ?? undefined,
        expiresAt: input.version.expiresAt ?? undefined,
      },
      select: { id: true },
    });

    for (const stop of [...input.version.stops].sort((a, b) => a.position - b.position)) {
      await tx.itineraryStop.create({
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
          snapshotJson: stop.snapshotJson ?? undefined,
        },
        select: { id: true, position: true },
      });
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
  snapshotJson?: Prisma.InputJsonValue | null;
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
  sourceMessageId?: string | null;
  routeJson?: Prisma.InputJsonValue | null;
  expiresAt?: Date | null;
  stops: SnapshotStopInput[];
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
        sourceMessageId: input.sourceMessageId ?? undefined,
        routeJson: input.routeJson ?? undefined,
        expiresAt: input.expiresAt ?? undefined,
      },
      select: { id: true },
    });

    for (const stop of [...input.stops].sort((a, b) => a.position - b.position)) {
      await tx.itineraryStop.create({
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
          snapshotJson: stop.snapshotJson ?? undefined,
        },
        select: { id: true, position: true },
      });
    }

    await tx.itinerary.update({
      where: { id: input.itineraryId },
      data: { currentVersion: input.version },
    });

    return tx.itineraryVersion.findUniqueOrThrow({
      where: { id: version.id },
      select: versionSelect,
    });
  });
}

export async function getActiveVersionSnapshot(itineraryId: string) {
  const selected = await prisma.itineraryVersion.findFirst({
    where: { itineraryId, isSelected: true },
    select: versionSelect,
  });
  if (selected) return selected;
  const itinerary = await prisma.itinerary.findUnique({
    where: { id: itineraryId },
    select: { currentVersion: true },
  });
  if (!itinerary) return null;
  return getVersionSnapshot({ itineraryId, version: itinerary.currentVersion });
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
  const version = await getActiveVersionSnapshot(input.itineraryId);
  return { ...itinerary, version };
}

export async function nextVersionNumber(itineraryId: string) {
  const row = await prisma.itineraryVersion.aggregate({
    where: { itineraryId },
    _max: { version: true },
  });
  return (row._max.version ?? 0) + 1;
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
      select: {
        id: true,
        version: true,
        routeJson: true,
        stops: { select: stopSelect, orderBy: { position: "asc" } },
      },
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
        routeJson: target.routeJson ?? undefined,
      },
      select: { id: true },
    });

    for (const stop of target.stops) {
      await tx.itineraryStop.create({
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
          snapshotJson: stop.snapshotJson ?? undefined,
        },
        select: { id: true, position: true },
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
