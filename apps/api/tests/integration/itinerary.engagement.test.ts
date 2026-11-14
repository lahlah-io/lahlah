import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, test } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/client.js";
import { createSession } from "../../src/shared/auth/session.service.js";

type TestUser = { userId: string; headers: { authorization: string } };

async function makeUser(label: string): Promise<TestUser> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
  const user = await prisma.user.create({
    data: { name: label, username: `${label}_${suffix}`, email: `${label}-${suffix}@example.test` },
    select: { id: true },
  });
  const session = await createSession(user.id, { userAgent: "engagement-test" });
  return { userId: user.id, headers: { authorization: `Bearer ${session.token}` } };
}

async function makeTrip(ownerId: string): Promise<string> {
  const trip = await prisma.trip.create({
    data: { title: "Engagement test", members: { create: { userId: ownerId } } },
    select: { id: true },
  });
  return trip.id;
}

async function cleanup(...userIds: string[]) {
  for (const userId of userIds) {
    const trips = await prisma.trip.findMany({ where: { members: { some: { userId } } }, select: { id: true } });
    for (const trip of trips) {
      await prisma.destinationCheckpoint.deleteMany({ where: { tripDestination: { tripId: trip.id } } });
      await prisma.tripDestination.deleteMany({ where: { tripId: trip.id } });
      await prisma.trip.delete({ where: { id: trip.id } }).catch(() => undefined);
    }
    await prisma.chatMessage.deleteMany({ where: { session: { userId } } });
    await prisma.chatSession.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.userSubscription.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
}

afterAll(async () => {
  await prisma.$disconnect();
});

test("like is idempotent and is counted on the itinerary detail", async () => {
  const owner = await makeUser("eng_like_owner");
  const other = await makeUser("eng_like_other");
  const tripId = await makeTrip(owner.userId);

  try {
    const anon = await app.request(`/api/v1/itineraries/${tripId}/like`, { method: "POST" });
    assert.equal(anon.status, 401);

    const first = await app.request(`/api/v1/itineraries/${tripId}/like`, {
      method: "POST",
      headers: other.headers,
    });
    assert.equal(first.status, 200);
    assert.deepEqual((await first.json()).data, { liked: true, likeCount: 1 });

    const second = await app.request(`/api/v1/itineraries/${tripId}/like`, {
      method: "POST",
      headers: other.headers,
    });
    assert.equal(second.status, 200);
    assert.deepEqual((await second.json()).data, { liked: true, likeCount: 1 });

    // Viewer is not a member, so the owner sees the count with likedByMe false.
    const ownerDetail = await app.request(`/api/v1/itineraries/${tripId}?userId=${owner.userId}`);
    assert.equal(ownerDetail.status, 200);
    const ownerBody = (await ownerDetail.json()).data;
    assert.equal(ownerBody.likeCount, 1);
    assert.equal(ownerBody.likedByMe, false);

    await app.request(`/api/v1/itineraries/${tripId}/like`, { method: "POST", headers: owner.headers });
    const likedByMe = await app.request(`/api/v1/itineraries/${tripId}?userId=${owner.userId}`);
    assert.equal((await likedByMe.json()).data.likedByMe, true);

    const unlike = await app.request(`/api/v1/itineraries/${tripId}/like`, {
      method: "DELETE",
      headers: owner.headers,
    });
    assert.equal(unlike.status, 200);
    assert.deepEqual((await unlike.json()).data, { liked: false, likeCount: 1 });

    const unlikeAgain = await app.request(`/api/v1/itineraries/${tripId}/like`, {
      method: "DELETE",
      headers: owner.headers,
    });
    assert.deepEqual((await unlikeAgain.json()).data, { liked: false, likeCount: 1 });

    const missing = await app.request(`/api/v1/itineraries/${randomUUID()}/like`, {
      method: "POST",
      headers: owner.headers,
    });
    assert.equal(missing.status, 404);
  } finally {
    await cleanup(owner.userId, other.userId);
  }
});

test("view is one per user per trip", async () => {
  const owner = await makeUser("eng_view");
  const tripId = await makeTrip(owner.userId);

  try {
    const anon = await app.request(`/api/v1/itineraries/${tripId}/view`, { method: "POST" });
    assert.equal(anon.status, 401);

    const first = await app.request(`/api/v1/itineraries/${tripId}/view`, {
      method: "POST",
      headers: owner.headers,
    });
    assert.equal(first.status, 200);
    assert.deepEqual((await first.json()).data, { counted: true, viewCount: 1 });

    const second = await app.request(`/api/v1/itineraries/${tripId}/view`, {
      method: "POST",
      headers: owner.headers,
    });
    assert.deepEqual((await second.json()).data, { counted: false, viewCount: 1 });

    const detail = await app.request(`/api/v1/itineraries/${tripId}?userId=${owner.userId}`);
    assert.equal((await detail.json()).data.viewCount, 1);

    const missing = await app.request(`/api/v1/itineraries/${randomUUID()}/view`, {
      method: "POST",
      headers: owner.headers,
    });
    assert.equal(missing.status, 404);
  } finally {
    await cleanup(owner.userId);
  }
});

test("publish only flips isPublic and keeps every version", async () => {
  const owner = await makeUser("eng_publish_owner");
  const other = await makeUser("eng_publish_other");
  const tripId = await makeTrip(owner.userId);

  try {
    const destination = await prisma.destination.findFirst({
      where: { city: "Padang", isActive: true },
      select: { id: true },
    });
    assert.ok(destination, "need one seeded Padang destination");
    // Two batches = two versions.
    for (const createdAt of [new Date("2026-12-01T00:00:00.000Z"), new Date("2026-12-02T00:00:00.000Z")]) {
      await prisma.tripDestination.create({
        data: { tripId, destinationId: destination.id, createdAt },
      });
    }

    const before = await app.request(`/api/v1/itineraries/${tripId}/versions?userId=${owner.userId}`);
    const versionsBefore = (await before.json()).data;
    assert.equal(versionsBefore.length, 2);

    const anon = await app.request(`/api/v1/itineraries/${tripId}/publish`, { method: "POST" });
    assert.equal(anon.status, 401);

    const foreign = await app.request(`/api/v1/itineraries/${tripId}/publish`, {
      method: "POST",
      headers: other.headers,
    });
    assert.equal(foreign.status, 404);

    const published = await app.request(`/api/v1/itineraries/${tripId}/publish`, {
      method: "POST",
      headers: owner.headers,
    });
    assert.equal(published.status, 200);
    assert.deepEqual((await published.json()).data, { id: tripId, isPublic: true });

    const detail = await app.request(`/api/v1/itineraries/${tripId}?userId=${owner.userId}`);
    const detailBody = (await detail.json()).data;
    assert.equal(detailBody.isPublic, true);
    assert.equal(detailBody.currentVersion, 2);

    const after = await app.request(`/api/v1/itineraries/${tripId}/versions?userId=${owner.userId}`);
    assert.deepEqual((await after.json()).data, versionsBefore);

    const unpublished = await app.request(`/api/v1/itineraries/${tripId}/publish`, {
      method: "DELETE",
      headers: owner.headers,
    });
    assert.equal(unpublished.status, 200);
    assert.deepEqual((await unpublished.json()).data, { id: tripId, isPublic: false });

    const missing = await app.request(`/api/v1/itineraries/${randomUUID()}/publish`, {
      method: "POST",
      headers: owner.headers,
    });
    assert.equal(missing.status, 404);
  } finally {
    await cleanup(owner.userId, other.userId);
  }
});
