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

export async function findByIdAndUser(id: string, userId: string) {
  return prisma.itinerary.findFirst({ where: { id, userId }, select: itinerarySelect });
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

export async function createFinal(input: {
  userId: string;
  sessionId: string;
  title: string;
  content: string;
  metadata: Prisma.InputJsonValue;
  destinations: Array<{
    destinationId: string;
    visitAt: Date | null;
    estimatedCost: number | null;
    notes: string | null;
  }>;
}) {
  return prisma.$transaction(async (tx) => {
    const itinerary = await tx.itinerary.create({
      data: {
        userId: input.userId,
        sessionId: input.sessionId,
        title: input.title,
        content: input.content,
        status: "final",
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
    return tx.itinerary.findUniqueOrThrow({ where: { id: itinerary.id }, select: itinerarySelect });
  });
}
