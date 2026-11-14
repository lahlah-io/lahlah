import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { prisma } from "../../src/db/client.js";
import { errorHandler } from "../../src/shared/http/errors.js";
import { createItineraryApi, createItineraryService } from "../../src/modules/itinerary/index.js";

const json = { "content-type": "application/json" };
const createdUserIds: string[] = [];

async function padangDestinations(limit = 2) {
  const rows = await prisma.destination.findMany({
    where: { city: "Padang", isActive: true, latitude: { not: null }, longitude: { not: null } },
    take: limit,
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  assert.ok(rows.length >= 2, "need >=2 active Padang destinations (run seed)");
  return rows;
}

async function createUser() {
  const user = await prisma.user.create({
    data: { name: "Sync Test", username: `u-${randomUUID()}`, email: `sync-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return user;
}

async function createSession(userId: string) {
  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "destination-sync" } },
    update: {},
    create: { provider: "test", modelIdentifier: "destination-sync", name: "destination-sync", isActive: true },
    select: { id: true },
  });
  return prisma.chatSession.create({ data: { userId, modelId: model.id, title: "sync" }, select: { id: true } });
}

async function seedItinerary() {
  const user = await createUser();
  const session = await createSession(user.id);
  const rows = await padangDestinations(3);
  const itinerary = await prisma.trip.create({
    data: {
      session: { connect: { id: session.id } },
      title: "Sync",
      members: { create: { userId: user.id, role: "owner" } },
    },
    select: { id: true },
  });
  return { user, session, rows, tripId: itinerary.id };
}

function buildApp() {
  const service = createItineraryService({
    findUserById: (id) => prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } }),
  });
  const app = new Hono();
  app.onError(errorHandler);
  app.route("/api/v1/itineraries", createItineraryApi(service));
  return app;
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    const itineraries = await prisma.trip.findMany({ where: { members: { some: { userId } } }, select: { id: true } });
    for (const itinerary of itineraries) {
      const versions = await prisma.tripVersion.findMany({
        where: { tripId: itinerary.id },
        select: { id: true },
      });
      await prisma.tripStop.deleteMany({
        where: { tripVersionId: { in: versions.map((version) => version.id) } },
      });
      await prisma.tripVersion.deleteMany({ where: { tripId: itinerary.id } });
      await prisma.destinationCheckpoint.deleteMany({ where: { tripDestination: { tripId: itinerary.id } } });
      await prisma.tripDestination.deleteMany({ where: { tripId: itinerary.id } });
    }
    await prisma.trip.deleteMany({ where: { members: { some: { userId } } } });
    await prisma.chatSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
});

test("itinerary detail only returns active destinations ordered by position", async () => {
  process.env.NODE_ENV = "test";
  const { user, rows, tripId } = await seedItinerary();
  await prisma.tripDestination.createMany({
    data: [
      { tripId, destinationId: rows[0]!.id, position: 2, isActive: true },
      { tripId, destinationId: rows[1]!.id, position: 1, isActive: true },
      { tripId, destinationId: rows[2]!.id, position: 3, isActive: false },
    ],
  });

  const res = await buildApp().request(`/api/v1/itineraries/${tripId}?userId=${user.id}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { destinations: Array<{ destinationId: string; position: number | null }> } };
  assert.deepEqual(
    body.data.destinations.map((d) => d.destinationId),
    [rows[1]!.id, rows[0]!.id],
  );
  assert.deepEqual(body.data.destinations.map((d) => d.position), [1, 2]);
});

test("publishing a version keeps checkpointed destinations and deactivates the rest", async () => {
  const { user, rows, tripId } = await seedItinerary();
  const version = await prisma.tripVersion.create({
    data: { tripId, version: 1, changeType: "generate", status: "generated" },
    select: { id: true },
  });
  const kept = await prisma.tripDestination.create({
    data: { tripId, destinationId: rows[0]!.id, position: 1, isActive: true },
    select: { id: true },
  });
  await prisma.tripDestination.create({
    data: { tripId, destinationId: rows[1]!.id, position: 2, isActive: true },
    select: { id: true },
  });
  await prisma.destinationCheckpoint.create({
    data: { tripDestinationId: kept.id, userId: user.id, imageUrl: "https://example.test/checkpoint.jpg" },
  });
  await prisma.tripStop.create({
    data: {
      tripVersionId: version.id,
      destinationId: rows[0]!.id,
      position: 1,
      name: rows[0]!.name,
      latitude: 0,
      longitude: 0,
    },
  });

  const app = buildApp();
  const res = await app.request(`/api/v1/itineraries/${tripId}/publish/1`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ userId: user.id }),
  });
  assert.equal(res.status, 200);

  const all = await prisma.tripDestination.findMany({
    where: { tripId },
    select: { destinationId: true, isActive: true },
    orderBy: { position: "asc" },
  });
  assert.equal(all.length, 2, "no itinerary destination row may be deleted");
  assert.deepEqual(
    all.map((row) => [row.destinationId, row.isActive]),
    [
      [rows[0]!.id, true],
      [rows[1]!.id, false],
    ],
  );
  assert.equal(await prisma.destinationCheckpoint.count({ where: { tripDestination: { tripId } } }), 1);
});

test("one destination row per trip is enforced by the database", async () => {
  const { rows, tripId } = await seedItinerary();
  await prisma.tripDestination.create({
    data: { tripId, destinationId: rows[0]!.id, position: 1, isActive: true },
  });
  await assert.rejects(
    prisma.tripDestination.create({
      data: { tripId, destinationId: rows[0]!.id, position: 2, isActive: true },
    }),
    (error: unknown) => (error as { code?: string }).code === "P2002",
  );
});
