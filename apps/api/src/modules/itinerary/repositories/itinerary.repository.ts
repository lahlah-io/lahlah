import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";
import { ensureTripForSessionTx } from "./trip.repository.js";
import { recordActivityLog } from "./activity-log.repository.js";

const destinationRowSelect = {
  id: true,
  tripId: true,
  destinationId: true,
  visitAt: true,
  estimatedCost: true,
  distance: true,
  notes: true,
  createdAt: true,
  destination: {
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      categories: { select: { category: { select: { slug: true } } } },
    },
  },
} satisfies Prisma.TripDestinationSelect;

const tripSelect = {
  id: true,
  chatSessionId: true,
  title: true,
  isPublic: true,
  shareSlug: true,
  createdAt: true,
  updatedAt: true,
  members: { select: { userId: true }, orderBy: { createdAt: "asc" } },
  destinations: {
    select: destinationRowSelect,
    orderBy: [{ createdAt: "asc" }, { visitAt: "asc" }],
  },
} satisfies Prisma.TripSelect;

export type TripRecord = Prisma.TripGetPayload<{ select: typeof tripSelect }>;
export type TripDestinationRow = TripRecord["destinations"][number];

/** Satu versi = semua baris trip_destinations dengan created_at identik. */
export type TripBatch = {
  version: number;
  createdAt: Date;
  rows: TripDestinationRow[];
};

export function groupBatches(rows: TripDestinationRow[]): TripBatch[] {
  const groups: Array<{ createdAt: Date; rows: TripDestinationRow[] }> = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.createdAt.getTime() === row.createdAt.getTime()) {
      last.rows.push(row);
      continue;
    }
    groups.push({ createdAt: row.createdAt, rows: [row] });
  }
  return groups.map((group, index) => ({ version: index + 1, ...group }));
}

export async function findById(id: string) {
  return prisma.trip.findUnique({ where: { id }, select: tripSelect });
}

export async function findBySessionId(sessionId: string) {
  return prisma.trip.findUnique({ where: { chatSessionId: sessionId }, select: tripSelect });
}

export async function upsertTripRoot(input: { userId: string; sessionId: string; title: string }) {
  return prisma.$transaction(async (tx) => {
    const trip = await ensureTripForSessionTx(tx, input);
    if (!trip) return null;
    await tx.trip.update({ where: { id: trip.id }, data: { title: input.title } });
    return { id: trip.id };
  });
}

export type BatchStopInput = {
  destinationId: string;
  visitAt: Date | null;
  estimatedCost?: number | null;
  distance?: number | null;
  notes?: string | null;
};

async function insertBatchTx(tx: Prisma.TransactionClient, tripId: string, stops: BatchStopInput[]) {
  // ponytail: batch identity = created_at. Bump past the newest batch so two
  // writes in the same millisecond stay distinct. Swap for a real batch column
  // if concurrency grows.
  const latest = await tx.tripDestination.findFirst({
    where: { tripId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const now = Date.now();
  const createdAt = new Date(Math.max(now, latest ? latest.createdAt.getTime() + 1 : now));
  await tx.tripDestination.createMany({
    data: stops.map((stop) => ({
      tripId,
      destinationId: stop.destinationId,
      visitAt: stop.visitAt,
      estimatedCost: stop.estimatedCost ?? null,
      distance: stop.distance ?? null,
      notes: stop.notes ?? null,
      createdAt,
    })),
  });
  return createdAt;
}

export async function appendBatch(input: { tripId: string; stops: BatchStopInput[] }) {
  return prisma.$transaction(async (tx) => {
    const createdAt = await insertBatchTx(tx, input.tripId, input.stops);
    return { tripId: input.tripId, createdAt, version: null as number | null };
  });
}

export async function listBatches(tripId: string) {
  const rows = await prisma.tripDestination.findMany({
    where: { tripId },
    orderBy: [{ createdAt: "asc" }, { visitAt: "asc" }],
    select: destinationRowSelect,
  });
  return groupBatches(rows);
}

export type RestoreBatchResult =
  | { ok: true; batch: TripBatch }
  | { ok: false; reason: "trip_not_found" | "version_not_found" | "conflict" };

/** Restore = salin isi batch lama menjadi batch baru (append), bukan menimpa. */
export async function restoreBatch(input: {
  tripId: string;
  userId: string;
  targetVersion: number;
  expectedVersion?: number;
}): Promise<RestoreBatchResult> {
  return prisma.$transaction(async (tx) => {
    const trip = await tx.trip.findUnique({ where: { id: input.tripId }, select: { id: true } });
    if (!trip) return { ok: false, reason: "trip_not_found" };

    const rows = await tx.tripDestination.findMany({
      where: { tripId: input.tripId },
      orderBy: [{ createdAt: "asc" }, { visitAt: "asc" }],
      select: destinationRowSelect,
    });
    const batches = groupBatches(rows);
    if (input.expectedVersion != null && input.expectedVersion !== batches.length) {
      return { ok: false, reason: "conflict" };
    }
    const target = batches.find((batch) => batch.version === input.targetVersion);
    if (!target) return { ok: false, reason: "version_not_found" };

    const createdAt = await insertBatchTx(
      tx,
      input.tripId,
      target.rows.map((row) => ({
        destinationId: row.destinationId,
        visitAt: row.visitAt,
        estimatedCost: row.estimatedCost,
        distance: row.distance,
        notes: row.notes,
      })),
    );
    await recordActivityLog(tx, {
      userId: input.userId,
      action: "version_restored",
      entityType: "trip",
      entityId: input.tripId,
      metadata: { version: input.targetVersion },
    });

    const restored = await tx.tripDestination.findMany({
      where: { tripId: input.tripId, createdAt },
      orderBy: { visitAt: "asc" },
      select: destinationRowSelect,
    });
    return {
      ok: true,
      batch: { version: batches.length + 1, createdAt, rows: restored },
    };
  });
}
