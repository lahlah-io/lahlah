import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/db/client.js";

const createdUserIds: string[] = [];

async function seed() {
  const user = await prisma.user.create({
    data: { name: "Trip Schema Test", username: `u-${randomUUID()}`, email: `trip-schema-${randomUUID()}@example.test` },
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
    await prisma.trip.deleteMany({ where: { members: { some: { userId } } } });
    await prisma.chatSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
});

test("creates trip with session link and owner membership", async () => {
  const { user, session } = await seed();
  const trip = await prisma.trip.create({
    data: {
      session: { connect: { id: session.id } },
      title: "Liburan Padang",
      members: { create: { userId: user.id, role: "owner" } },
    },
    include: { members: true },
  });
  assert.equal(trip.sessionId, session.id);
  assert.equal(trip.title, "Liburan Padang");
  assert.equal(trip.members.length, 1);
  assert.equal(trip.members[0]!.role, "owner");
});

test("user_trip enforces unique user_id and trip_id", async () => {
  const { user, session } = await seed();
  const trip = await prisma.trip.create({
    data: {
      session: { connect: { id: session.id } },
      title: "Unique Test Trip",
      members: { create: { userId: user.id, role: "owner" } },
    },
  });
  await assert.rejects(
    prisma.userTrip.create({
      data: { userId: user.id, tripId: trip.id, role: "editor" },
    }),
    (error: unknown) => (error as { code?: string }).code === "P2002",
  );
});
