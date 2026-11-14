import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, test } from "vitest";
import { prisma } from "../../src/db/client.js";

async function createUser() {
  return prisma.user.create({
    data: { name: "Itin Schema", username: `u-${randomUUID()}`, email: `itin-schema-${randomUUID()}@example.test` },
    select: { id: true },
  });
}

async function getOrCreateModel() {
  const existing = await prisma.model.findFirst({ select: { id: true } });
  if (existing) return existing;
  return prisma.model.create({
    data: {
      name: "schema-itin",
      provider: "test",
      modelIdentifier: `schema-itin-${randomUUID()}`,
    },
    select: { id: true },
  });
}

const createdUserIds: string[] = [];

afterAll(async () => {
  for (const userId of createdUserIds) {
    await prisma.trip.deleteMany({ where: { members: { some: { userId } } } });
    await prisma.chatSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
});

test("itinerary schema foundation: 1:1 session, versions/stops/route constraints", async () => {
  const user = await createUser();
  createdUserIds.push(user.id);
  const model = await getOrCreateModel();

  const session = await prisma.chatSession.create({
    data: { userId: user.id, modelId: model.id, title: "Itin schema" },
    select: { id: true },
  });

  const itinerary = await prisma.trip.create({
    data: {
      session: { connect: { id: session.id } },
      title: "Trip",
      currentVersion: 1,
      members: { create: { userId: user.id, role: "owner" } },
    },
    select: { id: true, sessionId: true, currentVersion: true },
  });

  assert.equal(itinerary.sessionId, session.id);
  assert.equal(itinerary.currentVersion, 1);

  // Prisma keeps the one-to-one session link unique by detaching the previous trip.
  await prisma.trip.create({
    data: {
      session: { connect: { id: session.id } },
      title: "Dup session",
      members: { create: { userId: user.id, role: "owner" } },
    },
  });
  assert.equal(await prisma.trip.count({ where: { sessionId: session.id } }), 1);

  const v1 = await prisma.tripVersion.create({
    data: {
      tripId: itinerary.id,
      version: 1,
      changeType: "initial",
      status: "confirmed",
    },
    select: { id: true, version: true },
  });
  assert.equal(v1.version, 1);

  await assert.rejects(
    () =>
      prisma.tripVersion.create({
        data: {
          tripId: itinerary.id,
          version: 1,
          changeType: "dup",
          status: "draft",
        },
      }),
    (err: any) => err?.code === "P2002",
  );

  const s1 = await prisma.tripStop.create({
    data: {
      tripVersionId: v1.id,
      position: 1,
      name: "Stop A",
      latitude: -0.95,
      longitude: 100.35,
    },
    select: { id: true, position: true },
  });
  const s2 = await prisma.tripStop.create({
    data: {
      tripVersionId: v1.id,
      position: 2,
      name: "Stop B",
      latitude: -0.96,
      longitude: 100.36,
    },
    select: { id: true, position: true },
  });
  assert.equal(s1.position, 1);
  assert.equal(s2.position, 2);

  await assert.rejects(
    () =>
      prisma.tripStop.create({
        data: {
          tripVersionId: v1.id,
          position: 1,
          name: "Dup pos",
          latitude: -0.97,
          longitude: 100.37,
        },
      }),
    (err: any) => err?.code === "P2002",
  );

  const stops = await prisma.tripStop.findMany({
    where: { tripVersionId: v1.id },
    orderBy: { position: "asc" },
    select: { position: true },
  });
  assert.deepEqual(stops.map((s) => s.position), [1, 2]);

  const withRoute = await prisma.tripVersion.update({
    where: { id: v1.id },
    data: {
      routeJson: {
        type: "LineString",
        coordinates: [[100.37, -0.97]],
        legs: [],
      },
    },
    select: { routeJson: true },
  });
  assert.ok(withRoute.routeJson);
});
