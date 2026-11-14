import { prisma } from "../../../db/client.js";

export type EngagementCounts = { likeCount: number; viewCount: number; likedByMe: boolean };

export async function tripExists(tripId: string): Promise<boolean> {
  const row = await prisma.trip.findFirst({
    where: { id: tripId, deletedAt: null },
    select: { id: true },
  });
  return row != null;
}

/** Idempoten: PK (user_id, trip_id) menolak like ganda lewat `skipDuplicates`. */
export async function like(userId: string, tripId: string): Promise<void> {
  await prisma.tripLike.createMany({ data: [{ userId, tripId }], skipDuplicates: true });
}

export async function unlike(userId: string, tripId: string): Promise<void> {
  await prisma.tripLike.deleteMany({ where: { userId, tripId } });
}

/** 1 view per user per trip; unique index (trip_id, user_id) membuat ini idempoten. */
export async function recordView(userId: string, tripId: string): Promise<boolean> {
  const result = await prisma.tripView.createMany({
    data: [{ userId, tripId }],
    skipDuplicates: true,
  });
  return result.count > 0;
}

export async function counts(tripId: string, userId: string): Promise<EngagementCounts> {
  const [likeCount, viewCount, mine] = await Promise.all([
    prisma.tripLike.count({ where: { tripId } }),
    prisma.tripView.count({ where: { tripId } }),
    prisma.tripLike.findUnique({
      where: { userId_tripId: { userId, tripId } },
      select: { userId: true },
    }),
  ]);
  return { likeCount, viewCount, likedByMe: mine != null };
}

/** Owner-only. Returns false when the trip is missing or the caller is not a member. */
export async function setPublic(input: {
  tripId: string;
  userId: string;
  isPublic: boolean;
}): Promise<boolean> {
  const result = await prisma.trip.updateMany({
    where: {
      id: input.tripId,
      deletedAt: null,
      members: { some: { userId: input.userId } },
    },
    data: { isPublic: input.isPublic },
  });
  return result.count > 0;
}
