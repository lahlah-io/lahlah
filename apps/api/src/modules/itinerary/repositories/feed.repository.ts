import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";

const feedSelect = {
  id: true,
  title: true,
  updatedAt: true,
  members: {
    orderBy: { createdAt: "asc" },
    take: 1,
    select: { user: { select: { name: true, username: true } } },
  },
  destinations: {
    select: {
      destinationId: true,
      createdAt: true,
      distance: true,
      destination: {
        select: { name: true, imageUrl: true, latitude: true, longitude: true },
      },
    },
  },
  _count: { select: { likes: true, views: true } },
} satisfies Prisma.TripSelect;

export type FeedRow = Prisma.TripGetPayload<{ select: typeof feedSelect }>;

const feedWhere = { isPublic: true, deletedAt: null } satisfies Prisma.TripWhereInput;

export async function listFeed(input: { page: number; limit: number }) {
  const [rows, total] = await Promise.all([
    prisma.trip.findMany({
      where: feedWhere,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      select: feedSelect,
    }),
    prisma.trip.count({ where: feedWhere }),
  ]);
  return { rows, total };
}

/** Trips the user belongs to, published or not: `GET /itineraries/mine`. */
export async function listByMember(input: { userId: string; limit: number }) {
  return prisma.trip.findMany({
    where: { deletedAt: null, members: { some: { userId: input.userId } } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: input.limit,
    select: feedSelect,
  });
}

export async function likedTripIds(userId: string, tripIds: string[]): Promise<Set<string>> {
  if (tripIds.length === 0) return new Set();
  const rows = await prisma.tripLike.findMany({
    where: { userId, tripId: { in: tripIds } },
    select: { tripId: true },
  });
  return new Set(rows.map((row) => row.tripId));
}
