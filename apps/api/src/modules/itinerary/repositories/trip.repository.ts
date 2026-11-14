import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";

// ponytail: `user_trips.status` doubles as the active marker; nothing else writes it.
// Swap for a dedicated `is_active` column if other lifecycle states appear.
export const ACTIVE_TRIP_STATUS = "active";

export async function ensureTripForSessionTx(
  tx: Prisma.TransactionClient,
  input: {
    sessionId: string;
    userId: string;
    title: string;
  },
) {
  const existing = await tx.trip.findUnique({
    where: { chatSessionId: input.sessionId },
    select: {
      id: true,
      title: true,
      members: { where: { userId: input.userId }, select: { id: true } },
    },
  });

  if (existing) {
    // Jangan beri akses ke sesi milik user lain.
    if (existing.members.length === 0) return null;
    return { id: existing.id, title: existing.title };
  }

  // A brand-new trip becomes the user's active one, so `GET /trips/active` works at once.
  await tx.userTrip.updateMany({
    where: { userId: input.userId, status: ACTIVE_TRIP_STATUS },
    data: { status: null },
  });

  return tx.trip.create({
    data: {
      chatSessionId: input.sessionId,
      title: input.title,
      members: { create: { userId: input.userId, status: ACTIVE_TRIP_STATUS } },
    },
    select: { id: true, title: true },
  });
}

export async function checkUserTripAccess(userId: string, tripId: string): Promise<boolean> {
  const member = await prisma.userTrip.findUnique({
    where: { userId_tripId: { userId, tripId } },
    select: { id: true },
  });
  return member != null;
}

export async function findTripMembership(userId: string, tripId: string) {
  return prisma.userTrip.findUnique({
    where: { userId_tripId: { userId, tripId } },
    select: { id: true },
  });
}

const activeTripSelect = {
  id: true,
  title: true,
  isPublic: true,
  updatedAt: true,
  destinations: { select: { destinationId: true, createdAt: true } },
} satisfies Prisma.TripSelect;

export type ActiveTripRecord = Prisma.TripGetPayload<{ select: typeof activeTripSelect }>;

export async function findActiveTrip(userId: string): Promise<ActiveTripRecord | null> {
  const membership = await prisma.userTrip.findFirst({
    where: { userId, status: ACTIVE_TRIP_STATUS, trip: { deletedAt: null } },
    select: { trip: { select: activeTripSelect } },
  });
  return membership?.trip ?? null;
}

/** Clears the previous marker and sets the new one atomically. */
export async function setActiveTrip(userId: string, tripId: string): Promise<void> {
  await prisma.$transaction([
    prisma.userTrip.updateMany({
      where: { userId, status: ACTIVE_TRIP_STATUS },
      data: { status: null },
    }),
    prisma.userTrip.update({
      where: { userId_tripId: { userId, tripId } },
      data: { status: ACTIVE_TRIP_STATUS },
    }),
  ]);
}

export async function clearActiveTrip(userId: string, tripId: string): Promise<void> {
  await prisma.userTrip.updateMany({
    where: { userId, tripId, status: ACTIVE_TRIP_STATUS },
    data: { status: null },
  });
}

/** How many of `destinationIds` the user already checked in at. */
export async function countUserCheckpoints(
  userId: string,
  tripId: string,
  destinationIds: string[],
): Promise<number> {
  if (destinationIds.length === 0) return 0;
  const rows = await prisma.destinationCheckpoint.findMany({
    where: { userId, tripDestination: { tripId, destinationId: { in: destinationIds } } },
    select: { tripDestination: { select: { destinationId: true } } },
  });
  return new Set(rows.map((row) => row.tripDestination.destinationId)).size;
}
