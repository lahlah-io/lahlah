import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/db/client.js";
import { ensureTripForSessionTx, findTripMembership, checkUserItineraryAccess } from "../../src/modules/itinerary/repositories/trip.repository.js";

const createdUserIds: string[] = [];

async function seedUser() {
  const user = await prisma.user.create({
    data: { name: "Membership Test", email: `membership-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return user;
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    const itineraries = await prisma.itinerary.findMany({ where: { userId }, select: { id: true } });
    for (const itinerary of itineraries) {
      await prisma.destinationCheckpoint.deleteMany({ where: { itineraryDestination: { itineraryId: itinerary.id } } });
      await prisma.itineraryDestination.deleteMany({ where: { itineraryId: itinerary.id } });
    }
    await prisma.itinerary.deleteMany({ where: { userId } });
    const userTrips = await prisma.userTrip.findMany({ where: { userId }, select: { tripId: true } });
    for (const ut of userTrips) {
      await prisma.userTrip.deleteMany({ where: { tripId: ut.tripId } });
      await prisma.trip.delete({ where: { id: ut.tripId } }).catch(() => undefined);
    }
    await prisma.chatSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
});

test("ensureTripForSessionTx creates trip and membership idempotently", async () => {
  const user = await seedUser();
  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "trip-member" } },
    update: {},
    create: { provider: "test", modelIdentifier: "trip-member", name: "trip-member", isActive: true },
    select: { id: true },
  });
  const session = await prisma.chatSession.create({
    data: { userId: user.id, modelId: model.id, title: "Session A" },
    select: { id: true },
  });

  const trip1 = await prisma.$transaction(async (tx) =>
    ensureTripForSessionTx(tx, { sessionId: session.id, userId: user.id, title: "Trip Padang", city: "Padang" }),
  );
  assert.ok(trip1.id);

  // Panggilan kedua harus idempotent (tidak membuat trip kedua atau duplikasi user_trip)
  const trip2 = await prisma.$transaction(async (tx) =>
    ensureTripForSessionTx(tx, { sessionId: session.id, userId: user.id, title: "Trip Padang", city: "Padang" }),
  );
  assert.equal(trip2.id, trip1.id);

  const membership = await findTripMembership(user.id, trip1.id);
  assert.equal(membership?.role, "owner");
});

test("checkUserItineraryAccess validates access via membership", async () => {
  const owner = await seedUser();
  const stranger = await seedUser();
  const model = await prisma.model.findFirstOrThrow({ select: { id: true } });
  const session = await prisma.chatSession.create({
    data: { userId: owner.id, modelId: model.id, title: "Session B" },
    select: { id: true },
  });
  const trip = await prisma.$transaction(async (tx) =>
    ensureTripForSessionTx(tx, { sessionId: session.id, userId: owner.id, title: "Access Trip" }),
  );
  const itinerary = await prisma.itinerary.create({
    data: {
      userId: owner.id,
      sessionId: session.id,
      tripId: trip.id,
      title: "Access Itinerary",
      content: "",
      status: "draft",
    },
    select: { id: true },
  });

  assert.equal(await checkUserItineraryAccess(owner.id, itinerary.id), true);
  assert.equal(await checkUserItineraryAccess(stranger.id, itinerary.id), false);
});
