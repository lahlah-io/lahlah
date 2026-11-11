import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, test } from "vitest";
import { prisma } from "../../src/db/client.js";

async function createUser() {
  return prisma.user.create({
    data: { name: "Itin Schema", email: `itin-schema-${randomUUID()}@example.test` },
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
    await prisma.itineraryStop.deleteMany({ where: { version: { itinerary: { userId } } } });
    await prisma.itineraryVersion.deleteMany({ where: { itinerary: { userId } } });
    await prisma.itineraryDraft.deleteMany({ where: { userId } });
    await prisma.destinationCheckpoint.deleteMany({ where: { itineraryDestination: { itinerary: { userId } } } });
    await prisma.itineraryDestination.deleteMany({ where: { itinerary: { userId } } });
    await prisma.itinerary.deleteMany({ where: { userId } });
    await prisma.chatMessage.deleteMany({ where: { session: { userId } } });
    await prisma.chatSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
});

test("itinerary schema foundation: 1:1 session, versions/stops/route constraints, draft unique, status confirmed", async () => {
  const user = await createUser();
  createdUserIds.push(user.id);
  const model = await getOrCreateModel();

  const session = await prisma.chatSession.create({
    data: { userId: user.id, modelId: model.id, title: "Itin schema" },
    select: { id: true },
  });

  const itinerary = await prisma.itinerary.create({
    data: {
      userId: user.id,
      sessionId: session.id,
      title: "Trip",
      content: "{}",
      status: "confirmed",
      currentVersion: 1,
      durationDays: 1,
      city: "Padang",
    } as any,
    select: { id: true, sessionId: true, status: true, currentVersion: true },
  });

  assert.equal(itinerary.sessionId, session.id);
  assert.equal(itinerary.status, "confirmed");
  assert.equal(itinerary.currentVersion, 1);

  await assert.rejects(
    () =>
      prisma.itinerary.create({
        data: {
          userId: user.id,
          sessionId: session.id,
          title: "Dup session",
          content: "{}",
        } as any,
      }),
    (err: any) => err?.code === "P2002",
  );

  const v1 = await prisma.itineraryVersion.create({
    data: {
      itineraryId: itinerary.id,
      version: 1,
      changeType: "initial",
      status: "confirmed",
    } as any,
    select: { id: true, version: true },
  });
  assert.equal(v1.version, 1);

  await assert.rejects(
    () =>
      prisma.itineraryVersion.create({
        data: {
          itineraryId: itinerary.id,
          version: 1,
          changeType: "dup",
          status: "draft",
        } as any,
      }),
    (err: any) => err?.code === "P2002",
  );

  const s1 = await prisma.itineraryStop.create({
    data: {
      itineraryVersionId: v1.id,
      position: 1,
      name: "Stop A",
      latitude: -0.95,
      longitude: 100.35,
    } as any,
    select: { id: true, position: true },
  });
  const s2 = await prisma.itineraryStop.create({
    data: {
      itineraryVersionId: v1.id,
      position: 2,
      name: "Stop B",
      latitude: -0.96,
      longitude: 100.36,
    } as any,
    select: { id: true, position: true },
  });
  assert.equal(s1.position, 1);
  assert.equal(s2.position, 2);

  await assert.rejects(
    () =>
      prisma.itineraryStop.create({
        data: {
          itineraryVersionId: v1.id,
          position: 1,
          name: "Dup pos",
          latitude: -0.97,
          longitude: 100.37,
        } as any,
      }),
    (err: any) => err?.code === "P2002",
  );

  const stops = await prisma.itineraryStop.findMany({
    where: { itineraryVersionId: v1.id },
    orderBy: { position: "asc" },
    select: { position: true },
  });
  assert.deepEqual(stops.map((s) => s.position), [1, 2]);

  const withRoute = await prisma.itineraryVersion.update({
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

  await prisma.itineraryDraft.create({
    data: {
      sessionId: session.id,
      userId: user.id,
      itineraryId: itinerary.id,
      payload: { sample: true },
      status: "pending_confirmation",
    } as any,
    select: { id: true },
  });

  await assert.rejects(
    () =>
      prisma.itineraryDraft.create({
        data: {
          sessionId: session.id,
          userId: user.id,
          payload: { dup: true },
          status: "pending_confirmation",
        } as any,
      }),
    (err: any) => err?.code === "P2002",
  );
});
