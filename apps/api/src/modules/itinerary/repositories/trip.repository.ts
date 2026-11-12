import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";

export async function ensureTripForSessionTx(
  tx: Prisma.TransactionClient,
  input: {
    sessionId: string;
    userId: string;
    title: string;
    city?: string;
    tripDate?: Date | null;
  },
) {
  const existing = await tx.trip.findUnique({
    where: { sessionId: input.sessionId },
    select: { id: true, title: true },
  });

  if (existing) {
    // Pastikan user_trip membership tersedia
    await tx.userTrip.upsert({
      where: { userId_tripId: { userId: input.userId, tripId: existing.id } },
      update: {},
      create: { userId: input.userId, tripId: existing.id, role: "owner" },
    });
    return existing;
  }

  const trip = await tx.trip.create({
    data: {
      sessionId: input.sessionId,
      title: input.title,
      city: input.city ?? "Padang",
      startDate: input.tripDate ?? null,
      members: {
        create: {
          userId: input.userId,
          role: "owner",
        },
      },
    },
    select: { id: true, title: true },
  });

  return trip;
}

export async function findTripMembership(userId: string, tripId: string) {
  return prisma.userTrip.findUnique({
    where: { userId_tripId: { userId, tripId } },
    select: { id: true, role: true },
  });
}

export async function checkUserItineraryAccess(userId: string, itineraryId: string): Promise<boolean> {
  const itinerary = await prisma.itinerary.findUnique({
    where: { id: itineraryId },
    select: { userId: true, tripId: true },
  });
  if (!itinerary) return false;
  if (itinerary.userId === userId) return true;
  if (itinerary.tripId) {
    const member = await prisma.userTrip.findUnique({
      where: { userId_tripId: { userId, tripId: itinerary.tripId } },
      select: { id: true },
    });
    return member != null;
  }
  return false;
}
