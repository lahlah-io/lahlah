import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, test } from "vitest";
import { prisma } from "../../src/db/client.js";
import { app } from "../../src/app.js";
import { createSession } from "../../src/shared/auth/session.service.js";

const createdUserIds: string[] = [];
const createdDestinationIds: string[] = [];

type SeedStop = { name: string; imageUrl?: string };

async function seedUser() {
  const user = await prisma.user.create({
    data: { name: "Feed Owner", username: `u-${randomUUID()}`, email: `feed-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return user;
}

async function seedTrip(userId: string, stops: SeedStop[], isPublic: boolean) {
  const destinationIds: string[] = [];
  for (const stop of stops) {
    const destination = await prisma.destination.create({
      data: {
        name: stop.name,
        city: "Padang",
        source: "manual",
        latitude: -0.9471,
        longitude: 100.4172,
        imageUrl: stop.imageUrl,
      },
      select: { id: true },
    });
    destinationIds.push(destination.id);
    createdDestinationIds.push(destination.id);
  }

  const trip = await prisma.trip.create({
    data: { title: `Feed Trip ${randomUUID()}`, members: { create: { userId } } },
    select: { id: true },
  });
  await prisma.tripDestination.createMany({
    data: destinationIds.map((destinationId) => ({ tripId: trip.id, destinationId })),
  });
  if (isPublic) await prisma.trip.update({ where: { id: trip.id }, data: { isPublic: true } });
  return { tripId: trip.id, destinationIds };
}

type FeedBody = {
  data: Array<{
    id: string;
    title: string;
    author: { name: string; username: string } | null;
    stopCount: number;
    destinationNames: string[];
    coverImageUrl: string | null;
    waypoints: [number, number][];
    likeCount: number;
    viewCount: number;
    likedByMe: boolean;
  }>;
  meta: { page: number; limit: number; total: number; hasMore: boolean };
};

async function getFeed(token: string | null, query = "") {
  return app.request(`/api/v1/itineraries/feed${query}`, {
    headers: token ? { cookie: `lahlah_session=${token}` } : {},
  });
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    await prisma.trip.deleteMany({ where: { members: { some: { userId } } } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
  for (const id of createdDestinationIds) {
    await prisma.destination.delete({ where: { id } }).catch(() => undefined);
  }
});

test("feed requires a session", async () => {
  const response = await getFeed(null);
  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "UNAUTHENTICATED");
});

test("feed lists only published trips, newest activity first", async () => {
  const owner = await seedUser();
  const viewer = await seedUser();
  const session = await createSession(viewer.id, { userAgent: "feed-test" });

  const older = await seedTrip(owner.id, [{ name: "Pantai Air Manis" }, { name: "Jembatan Sitti Nurbaya" }], true);
  const privacy = await seedTrip(owner.id, [{ name: "Rahasia" }], false);
  const newer = await seedTrip(owner.id, [{ name: "Danau Singkarak" }], true);

  const response = await getFeed(session.token, "?limit=50");
  assert.equal(response.status, 200);
  const body = (await response.json()) as FeedBody;

  const ids = body.data.map((card) => card.id);
  assert.ok(ids.includes(older.tripId), "published trip missing");
  assert.ok(ids.includes(newer.tripId), "published trip missing");
  assert.ok(!ids.includes(privacy.tripId), "private trip leaked into the feed");
  assert.ok(ids.indexOf(newer.tripId) < ids.indexOf(older.tripId), "newest activity must come first");

  const card = body.data.find((item) => item.id === older.tripId);
  assert.ok(card);
  assert.equal(card.stopCount, 2);
  assert.deepEqual(card.destinationNames, ["Pantai Air Manis", "Jembatan Sitti Nurbaya"]);
  assert.equal(card.coverImageUrl, null);
  // Every seeded stop is geocoded, so the card carries a route cover.
  assert.equal(card.waypoints.length, 2);
  assert.equal(card.likedByMe, false);
  assert.equal(typeof card.author?.username, "string");
  assert.equal(body.meta.page, 1);
  assert.equal(body.meta.limit, 50);
  assert.equal(body.meta.hasMore, false);
});

test("cover photo is proxied, likes are counted, and pagination reports hasMore", async () => {
  const owner = await seedUser();
  const viewer = await seedUser();
  const session = await createSession(viewer.id, { userAgent: "feed-test" });

  const photo = await seedTrip(
    owner.id,
    [
      { name: "Pantai Padang" },
      { name: "Pulau Pasumpahan", imageUrl: "https://upload.wikimedia.org/wikipedia/commons/x.jpg" },
    ],
    true,
  );
  await prisma.tripLike.create({ data: { userId: viewer.id, tripId: photo.tripId } });
  await prisma.tripView.create({ data: { userId: viewer.id, tripId: photo.tripId } });
  // Guarantees a second page even when this file runs alone.
  await seedTrip(owner.id, [{ name: "Pantai Carolina" }], true);

  const page = await getFeed(session.token, "?limit=1&page=1");
  assert.equal(page.status, 200);
  const first = (await page.json()) as FeedBody;
  assert.equal(first.data.length, 1);
  assert.equal(first.meta.hasMore, true);

  const all = (await (await getFeed(session.token, "?limit=50")).json()) as FeedBody;
  const card = all.data.find((item) => item.id === photo.tripId);
  assert.ok(card);
  assert.ok(card.coverImageUrl?.startsWith("/api/v1/images?src="), String(card.coverImageUrl));
  assert.ok(card.coverImageUrl.includes("w=800"));
  assert.equal(card.likeCount, 1);
  assert.equal(card.viewCount, 1);
  assert.equal(card.likedByMe, true);
});
