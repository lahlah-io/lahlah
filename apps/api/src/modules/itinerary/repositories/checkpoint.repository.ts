import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";

const checkpointSelect = {
  id: true,
  tripDestinationId: true,
  userId: true,
  latitude: true,
  longitude: true,
  accuracyMeters: true,
  distanceMeters: true,
  note: true,
  imageUrl: true,
  createdAt: true,
} satisfies Prisma.DestinationCheckpointSelect;

const targetSelect = {
  id: true,
  tripId: true,
  destinationId: true,
  destination: { select: { name: true, latitude: true, longitude: true } },
} satisfies Prisma.TripDestinationSelect;

export type CheckpointTarget = Prisma.TripDestinationGetPayload<{ select: typeof targetSelect }>;
export type CheckpointRow = Prisma.DestinationCheckpointGetPayload<{ select: typeof checkpointSelect }>;

export async function findCheckpointTarget(tripId: string, tripDestinationId: string) {
  const row = await prisma.tripDestination.findUnique({
    where: { id: tripDestinationId },
    select: targetSelect,
  });
  return row && row.tripId === tripId ? row : null;
}

export async function findCheckpoint(tripDestinationId: string, userId: string) {
  return prisma.destinationCheckpoint.findUnique({
    where: { tripDestinationId_userId: { tripDestinationId, userId } },
    select: checkpointSelect,
  });
}

export async function createCheckpoint(input: {
  tripDestinationId: string;
  userId: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  distanceMeters: number;
  note?: string;
  imageUrl?: string;
}) {
  return prisma.destinationCheckpoint.create({
    data: {
      tripDestinationId: input.tripDestinationId,
      userId: input.userId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: input.accuracyMeters,
      distanceMeters: input.distanceMeters,
      note: input.note,
      imageUrl: input.imageUrl,
    },
    select: checkpointSelect,
  });
}

/** Latest check-in per destination for the whole trip, newest first. */
export async function listTripCheckpoints(tripId: string) {
  const rows = await prisma.destinationCheckpoint.findMany({
    where: { tripDestination: { tripId } },
    orderBy: { createdAt: "desc" },
    select: {
      ...checkpointSelect,
      tripDestination: {
        select: { destinationId: true, destination: { select: { name: true } } },
      },
    },
  });

  const seen = new Set<string>();
  return rows.filter((row) => {
    const destinationId = row.tripDestination.destinationId;
    if (seen.has(destinationId)) return false;
    seen.add(destinationId);
    return true;
  });
}

export type TripCheckpointRow = Awaited<ReturnType<typeof listTripCheckpoints>>[number];
