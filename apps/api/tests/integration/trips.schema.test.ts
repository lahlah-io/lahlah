import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/db/client.js";

const createdUserIds: string[] = [];

async function seed() {
  const user = await prisma.user.create({
    data: { name: "Trip Schema Test", email: `trip-schema-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "trip-schema" } },
    update: {},
    create: { provider: "test", modelIdentifier: "trip-schema", name: "trip-schema", isActive: true },
    select: { id: true },
  });
  const session = await prisma.chatSession.create({
    data: { userId: user.id, modelId: model.id, title: "trip-session" },
    select: { id: true },
  });
  return { user, session };
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

test("creates trip and user_trip membership, links itinerary to trip", async () => {
  const { user, session } = await seed();
  const trip = await prisma.trip.create({
    data: {
      sessionId: session.id,
      title: "Liburan Padang",
      city: "Padang",
      members: {
        create: {
          userId: user.id,
          role: "owner",
        },
      },
    },
    include: { members: true },
  });
  assert.equal(trip.title, "Liburan Padang");
  assert.equal(trip.members.length, 1);
  assert.equal(trip.members[0]!.role, "owner");

  const itinerary = await prisma.itinerary.create({
    data: {
      userId: user.id,
      sessionId: session.id,
      tripId: trip.id,
      title: "Itinerary Padang",
      content: "",
      status: "draft",
    },
    select: { id: true, tripId: true },
  });
  assert.equal(itinerary.tripId, trip.id);
});

test("user_trip enforces unique user_id and trip_id", async () => {
  const { user, session } = await seed();
  const trip = await prisma.trip.create({
    data: {
      sessionId: session.id,
      title: "Unique Test Trip",
      members: {
        create: { userId: user.id, role: "owner" },
      },
    },
  });
  await assert.rejects(
    prisma.userTrip.create({
      data: { userId: user.id, tripId: trip.id, role: "editor" },
    }),
    (error: unknown) => (error as { code?: string }).code === "P2002",
  );
});
