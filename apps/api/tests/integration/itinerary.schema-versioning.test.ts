import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/db/client.js";

const createdUserIds: string[] = [];

async function seed() {
  const user = await prisma.user.create({
    data: { name: "Schema Test", email: `schema-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "schema-versioning" } },
    update: {},
    create: { provider: "test", modelIdentifier: "schema-versioning", name: "schema-versioning", isActive: true },
    select: { id: true },
  });
  const session = await prisma.chatSession.create({
    data: { userId: user.id, modelId: model.id, title: "schema" },
    select: { id: true },
  });
  const itinerary = await prisma.itinerary.create({
    data: {
      userId: user.id,
      sessionId: session.id,
      title: "Schema",
      content: "",
      status: "draft",
    },
    select: { id: true },
  });
  const destination = await prisma.destination.findFirstOrThrow({
    where: { city: "Padang", isActive: true },
    select: { id: true },
  });
  return { userId: user.id, itineraryId: itinerary.id, destinationId: destination.id };
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    const itineraries = await prisma.itinerary.findMany({ where: { userId }, select: { id: true } });
    for (const itinerary of itineraries) {
      await prisma.destinationCheckpoint.deleteMany({ where: { itineraryDestination: { itineraryId: itinerary.id } } });
      await prisma.itineraryDestination.deleteMany({ where: { itineraryId: itinerary.id } });
    }
    await prisma.itinerary.deleteMany({ where: { userId } });
    await prisma.chatSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
});

test("itinerary version defaults to not saved and not selected", async () => {
  const { itineraryId } = await seed();
  const version = await prisma.itineraryVersion.create({
    data: { itineraryId, version: 1, changeType: "generate", status: "generated" },
    select: { isSaved: true, isSelected: true },
  });
  assert.equal(version.isSaved, false);
  assert.equal(version.isSelected, false);
});

test("database rejects two selected versions for one itinerary", async () => {
  const { itineraryId } = await seed();
  const first = await prisma.itineraryVersion.create({
    data: { itineraryId, version: 1, changeType: "generate", status: "generated", isSelected: true },
    select: { id: true },
  });
  assert.ok(first.id);
  await assert.rejects(
    prisma.itineraryVersion.create({
      data: { itineraryId, version: 2, changeType: "generate", status: "generated", isSelected: true },
    }),
    (error: unknown) => (error as { code?: string }).code === "P2002",
  );
});

test("itinerary destination defaults to active with no position", async () => {
  const { itineraryId, destinationId } = await seed();
  const row = await prisma.itineraryDestination.create({
    data: { itineraryId, destinationId },
    select: { isActive: true, position: true },
  });
  assert.equal(row.isActive, true);
  assert.equal(row.position, null);
});
