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

test("itinerary schema: one trip per chat session, append-only trip_destinations", async () => {
  const user = await createUser();
  createdUserIds.push(user.id);
  const model = await getOrCreateModel();

  const session = await prisma.chatSession.create({
    data: { userId: user.id, modelId: model.id, title: "Itin schema" },
    select: { id: true },
  });

  const trip = await prisma.trip.create({
    data: {
      chatSessionId: session.id,
      title: "Trip",
      members: { create: { userId: user.id } },
    },
    select: { id: true, chatSessionId: true },
  });
  assert.equal(trip.chatSessionId, session.id);

  await assert.rejects(
    () =>
      prisma.trip.create({
        data: { chatSessionId: session.id, title: "Dup session", members: { create: { userId: user.id } } },
      }),
    (err: any) => err?.code === "P2002",
  );

  const destinations = await prisma.destination.findMany({
    where: { city: "Padang", isActive: true },
    take: 2,
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(destinations.length, 2, "need >=2 active Padang destinations (run seed)");

  const createdAt = new Date("2026-12-01T08:00:00.000Z");
  const visitAt = new Date("2026-12-01T09:00:00.000Z");
  const first = await prisma.tripDestination.create({
    data: { tripId: trip.id, destinationId: destinations[0]!.id, visitAt, createdAt },
    select: { id: true, createdAt: true, visitAt: true },
  });
  assert.equal(first.createdAt.getTime(), createdAt.getTime());

  // Append-only: same destination may appear again in a later batch.
  const second = await prisma.tripDestination.create({
    data: {
      tripId: trip.id,
      destinationId: destinations[0]!.id,
      visitAt,
      createdAt: new Date(createdAt.getTime() + 1000),
    },
    select: { id: true, createdAt: true },
  });
  assert.notEqual(second.id, first.id);
  assert.notEqual(second.createdAt.getTime(), first.createdAt.getTime());

  // Ordering is carried by visit_at, not a position column.
  await prisma.tripDestination.create({
    data: { tripId: trip.id, destinationId: destinations[1]!.id, visitAt: new Date("2026-12-01T07:00:00.000Z"), createdAt },
  });
  const ordered = await prisma.tripDestination.findMany({
    where: { tripId: trip.id },
    orderBy: { visitAt: "asc" },
    select: { destinationId: true },
  });
  assert.equal(ordered[0]!.destinationId, destinations[1]!.id);

  // A chat session delete is a soft delete: the row survives.
  await prisma.chatSession.update({ where: { id: session.id }, data: { deletedAt: new Date() } });
  assert.ok(await prisma.chatSession.findUnique({ where: { id: session.id }, select: { id: true } }));
});
