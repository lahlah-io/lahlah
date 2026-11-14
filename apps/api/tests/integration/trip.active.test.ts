import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, test } from "vitest";
import { prisma } from "../../src/db/client.js";
import { HttpError } from "../../src/shared/http/errors.js";
import { createTripService } from "../../src/modules/itinerary/services/trip.service.js";

const service = createTripService();
const createdUserIds: string[] = [];
const createdDestinationIds: string[] = [];

async function seedUser() {
  const user = await prisma.user.create({
    data: { name: "Active Trip", username: `u-${randomUUID()}`, email: `at-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return user;
}

async function seedTrip(userId: string, stops: number) {
  const destinationIds: string[] = [];
  for (let index = 0; index < stops; index += 1) {
    const destination = await prisma.destination.create({
      data: {
        name: `Active Destination ${randomUUID()}`,
        city: "Padang",
        source: "manual",
        latitude: -0.9471,
        longitude: 100.4172,
      },
      select: { id: true },
    });
    destinationIds.push(destination.id);
    createdDestinationIds.push(destination.id);
  }

  const trip = await prisma.trip.create({
    data: { title: `Active Trip ${randomUUID()}`, members: { create: { userId } } },
    select: { id: true },
  });
  const visitAt = new Date(Date.now() + 86_400_000);
  const stopsCreated = await prisma.tripDestination.createMany({
    data: destinationIds.map((destinationId) => ({
      tripId: trip.id,
      destinationId,
      visitAt,
      createdAt: new Date(),
    })),
  });
  assert.equal(stopsCreated.count, stops);

  return { tripId: trip.id, destinationIds };
}

async function activeTripIds(userId: string) {
  const rows = await prisma.userTrip.findMany({
    where: { userId, status: "active" },
    select: { tripId: true },
  });
  return rows.map((row) => row.tripId);
}

async function expectHttpError(fn: () => Promise<unknown>, code: string) {
  await assert.rejects(fn, (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    return true;
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

test("no active trip yields NO_ACTIVE_TRIP", async () => {
  const user = await seedUser();
  await expectHttpError(() => service.getActive({ userId: user.id }), "NO_ACTIVE_TRIP");
});

test("activating a second trip clears the first, and the summary counts stops and check-ins", async () => {
  const user = await seedUser();
  const first = await seedTrip(user.id, 2);
  const second = await seedTrip(user.id, 3);

  const activatedFirst = await service.activate({ userId: user.id, tripId: first.tripId });
  assert.equal(activatedFirst.data.tripId, first.tripId);
  assert.equal(activatedFirst.data.total, 2);
  assert.equal(activatedFirst.data.checked, 0);
  assert.deepEqual(await activeTripIds(user.id), [first.tripId]);

  const activatedSecond = await service.activate({ userId: user.id, tripId: second.tripId });
  assert.equal(activatedSecond.data.total, 3);
  assert.deepEqual(await activeTripIds(user.id), [second.tripId]);

  const stop = await prisma.tripDestination.findFirstOrThrow({
    where: { tripId: second.tripId },
    select: { id: true },
  });
  await prisma.destinationCheckpoint.create({
    data: {
      tripDestinationId: stop.id,
      userId: user.id,
      latitude: -0.9471,
      longitude: 100.4172,
      distanceMeters: 3,
    },
  });

  const active = await service.getActive({ userId: user.id });
  assert.equal(active.data.tripId, second.tripId);
  assert.equal(active.data.total, 3);
  assert.equal(active.data.checked, 1);
});

test("deactivating clears the marker", async () => {
  const user = await seedUser();
  const { tripId } = await seedTrip(user.id, 1);
  await service.activate({ userId: user.id, tripId });

  const cleared = await service.deactivate({ userId: user.id, tripId });
  assert.deepEqual(cleared.data, { tripId, isActive: false });
  assert.deepEqual(await activeTripIds(user.id), []);
  await expectHttpError(() => service.getActive({ userId: user.id }), "NO_ACTIVE_TRIP");
});

test("non-members cannot touch the active marker", async () => {
  const owner = await seedUser();
  const stranger = await seedUser();
  const { tripId } = await seedTrip(owner.id, 1);

  await expectHttpError(() => service.activate({ userId: stranger.id, tripId }), "FORBIDDEN");
  await expectHttpError(() => service.deactivate({ userId: stranger.id, tripId }), "FORBIDDEN");
  assert.deepEqual(await activeTripIds(owner.id), []);
});
