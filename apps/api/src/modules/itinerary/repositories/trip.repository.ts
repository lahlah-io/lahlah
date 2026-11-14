import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";

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

  return tx.trip.create({
    data: {
      chatSessionId: input.sessionId,
      title: input.title,
      members: { create: { userId: input.userId } },
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
