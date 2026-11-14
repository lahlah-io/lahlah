import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";

export async function ensureTripForSessionTx(
  tx: Prisma.TransactionClient,
  input: {
    sessionId: string;
    userId: string;
    title: string;
    startDate?: Date | null;
    metadata?: Prisma.InputJsonValue;
  },
) {
  const existing = await tx.trip.findUnique({
    where: { sessionId: input.sessionId },
    select: {
      id: true,
      title: true,
      currentVersion: true,
      members: { where: { userId: input.userId }, select: { id: true } },
    },
  });

  if (existing) {
    // Jangan beri akses ke sesi milik user lain.
    if (existing.members.length === 0) return null;
    return { id: existing.id, title: existing.title, currentVersion: existing.currentVersion };
  }

  return tx.trip.create({
    data: {
      sessionId: input.sessionId,
      title: input.title,
      startDate: input.startDate ?? null,
      metadata: input.metadata ?? {},
      members: { create: { userId: input.userId, role: "owner" } },
    },
    select: { id: true, title: true, currentVersion: true },
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
    select: { id: true, role: true },
  });
}
