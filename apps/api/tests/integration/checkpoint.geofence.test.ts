import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/db/client.js";
import { HttpError } from "../../src/shared/http/errors.js";
import {
  CHECKPOINT_RADIUS_M,
  createCheckpointService,
} from "../../src/modules/itinerary/services/checkpoint.service.js";

const service = createCheckpointService();
const createdUserIds: string[] = [];
const createdDestinationIds: string[] = [];

const origin = { latitude: -0.9471, longitude: 100.4172 };

async function seedUser() {
  const user = await prisma.user.create({
    data: { name: "Checkpoint Test", username: `u-${randomUUID()}`, email: `cp-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return user;
}

async function seedTrip(userId: string) {
  const destination = await prisma.destination.create({
    data: {
      name: `Checkpoint Destination ${randomUUID()}`,
      city: "Padang",
      source: "manual",
      latitude: origin.latitude,
      longitude: origin.longitude,
    },
    select: { id: true },
  });
  createdDestinationIds.push(destination.id);

  const trip = await prisma.trip.create({
    data: { title: "Checkpoint Trip", members: { create: { userId } } },
    select: { id: true },
  });
  const stop = await prisma.tripDestination.create({
    data: { tripId: trip.id, destinationId: destination.id },
    select: { id: true },
  });
  return { tripId: trip.id, tripDestinationId: stop.id };
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

test("check-in requires trip membership", async () => {
  const member = await seedUser();
  const stranger = await seedUser();
  const { tripId, tripDestinationId } = await seedTrip(member.id);

  await expectHttpError(
    () =>
      service.checkIn({
        tripId,
        tripDestinationId,
        userId: stranger.id,
        latitude: origin.latitude,
        longitude: origin.longitude,
      }),
    "FORBIDDEN",
  );
});

test("check-in rejects a device outside the 100 m radius", async () => {
  const user = await seedUser();
  const { tripId, tripDestinationId } = await seedTrip(user.id);

  await expectHttpError(
    () =>
      service.checkIn({
        tripId,
        tripDestinationId,
        userId: user.id,
        latitude: origin.latitude + 0.01,
        longitude: origin.longitude,
      }),
    "CHECKPOINT_TOO_FAR",
  );
});

test("check-in rejects an inaccurate GPS reading", async () => {
  const user = await seedUser();
  const { tripId, tripDestinationId } = await seedTrip(user.id);

  await expectHttpError(
    () =>
      service.checkIn({
        tripId,
        tripDestinationId,
        userId: user.id,
        latitude: origin.latitude,
        longitude: origin.longitude,
        accuracyMeters: 500,
      }),
    "LOCATION_INACCURATE",
  );
});

test("check-in stores distance, is idempotent, and shows progress", async () => {
  const user = await seedUser();
  const { tripId, tripDestinationId } = await seedTrip(user.id);
  const input = {
    tripId,
    tripDestinationId,
    userId: user.id,
    latitude: origin.latitude + 0.0003,
    longitude: origin.longitude,
    accuracyMeters: 8,
  };

  const first = await service.checkIn(input);
  assert.equal(first.created, true);
  assert.ok(first.data.distanceMeters != null && first.data.distanceMeters <= CHECKPOINT_RADIUS_M);

  const second = await service.checkIn(input);
  assert.equal(second.created, false);
  assert.equal(second.data.id, first.data.id);

  const progress = await service.list({ tripId, userId: user.id });
  assert.equal(progress.data.total, 1);
  assert.equal(progress.data.checked, 1);
  assert.equal(progress.data.items.length, 1);
});
