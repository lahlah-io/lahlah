import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, test } from "vitest";
import { prisma } from "../../src/db/client.js";
import {
  createVersionSnapshotTx,
  getCurrentSnapshot,
  getVersionSnapshot,
} from "../../src/modules/itinerary/repositories/itinerary.repository.js";

async function createUser() {
  return prisma.user.create({
    data: { name: "Itin Repo", email: `itin-repo-${randomUUID()}@example.test` },
    select: { id: true },
  });
}

async function getOrCreateModel() {
  const existing = await prisma.model.findFirst({ select: { id: true } });
  if (existing) return existing;
  return prisma.model.create({
    data: { name: "itin-repo", provider: "test", modelIdentifier: `itin-repo-${randomUUID()}` },
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

test("itinerary repository: snapshot tx writes atomically, uniqueness enforced, snapshots readable", async () => {
  const user = await createUser();
  createdUserIds.push(user.id);
  const model = await getOrCreateModel();
  const session = await prisma.chatSession.create({
    data: { userId: user.id, modelId: model.id, title: "itin-repo" },
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
      city: "Padang",
    } as any,
    select: { id: true, currentVersion: true },
  });

  const snap = await createVersionSnapshotTx({
    itineraryId: itinerary.id,
    version: 1,
    changeType: "initial",
    status: "confirmed",
    totalDistanceM: 1200,
    stops: [
      { position: 1, name: "Stop A", latitude: -0.95, longitude: 100.35, arrivalTime: "08:00", departureTime: "09:00" },
      { position: 2, name: "Stop B", latitude: -0.96, longitude: 100.36, arrivalTime: "09:30", departureTime: "10:30" },
    ],
    routeJson: {
      type: "LineString",
      coordinates: [[100.35, -0.95], [100.36, -0.96]],
      legs: [
        {
          fromPosition: 1,
          toPosition: 2,
          transportMode: "driving",
          distanceM: 1200,
          durationSec: 600,
          geometry: { type: "LineString", coordinates: [[100.35, -0.95], [100.36, -0.96]] },
          provider: "osrm",
          profile: "car",
          fallback: false,
        },
      ],
    },
  });

  assert.ok(snap);
  assert.equal(snap.version, 1);
  assert.equal(snap.itineraryId, itinerary.id);
  assert.equal(snap.stops.length, 2);
  assert.deepEqual(snap.stops.map((s) => s.position), [1, 2]);
  const routeJson = snap.routeJson as { legs: Array<{ transportMode: string }> };
  assert.equal(routeJson.legs.length, 1);
  assert.equal(routeJson.legs[0]?.transportMode, "driving");

  const current = await getCurrentSnapshot({ itineraryId: itinerary.id });
  assert.ok(current);
  assert.equal(current!.id, itinerary.id);
  assert.equal(current!.currentVersion, 1);
  assert.ok(current!.version);
  assert.equal(current!.version!.version, 1);
  assert.equal(current!.version!.stops.length, 2);
  assert.equal((current!.version!.routeJson as { legs: unknown[] }).legs.length, 1);
  assert.deepEqual(current!.version!.stops.map((s) => s.name), ["Stop A", "Stop B"]);

  const byVersion = await getVersionSnapshot({ itineraryId: itinerary.id, version: 1 });
  assert.ok(byVersion);
  assert.equal(byVersion!.version, 1);
  assert.equal(byVersion!.stops.length, 2);
  assert.equal((byVersion!.routeJson as { legs: unknown[] }).legs.length, 1);

  const missing = await getVersionSnapshot({ itineraryId: itinerary.id, version: 99 });
  assert.equal(missing, null);

  await assert.rejects(
    () =>
      createVersionSnapshotTx({
        itineraryId: itinerary.id,
        version: 1,
        changeType: "dup",
        status: "draft",
        stops: [{ position: 1, name: "X", latitude: 0, longitude: 0 }],
      }),
    (err: any) => err?.code === "P2002",
  );
});
