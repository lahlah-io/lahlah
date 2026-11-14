import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/db/client.js";
import { createItineraryService } from "../../src/modules/itinerary/index.js";

const createdUserIds: string[] = [];

async function seed() {
  const user = await prisma.user.create({
    data: { name: "Log Test", username: `u-${randomUUID()}`, email: `log-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "act-log" } },
    update: {},
    create: { provider: "test", modelIdentifier: "act-log", name: "act-log", isActive: true },
    select: { id: true },
  });
  const session = await prisma.chatSession.create({
    data: { userId: user.id, modelId: model.id, title: "log-session" },
    select: { id: true },
  });
  return { user, session };
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    await prisma.activityLog.deleteMany({ where: { userId } });
    const itineraries = await prisma.trip.findMany({ where: { members: { some: { userId } } }, select: { id: true } });
    for (const itinerary of itineraries) {
      await prisma.destinationCheckpoint.deleteMany({ where: { tripDestination: { tripId: itinerary.id } } });
      await prisma.tripDestination.deleteMany({ where: { tripId: itinerary.id } });
    }
    await prisma.trip.deleteMany({ where: { members: { some: { userId } } } });
    const userTrips = await prisma.userTrip.findMany({ where: { userId }, select: { tripId: true } });
    for (const ut of userTrips) {
      await prisma.userTrip.deleteMany({ where: { tripId: ut.tripId } });
      await prisma.trip.delete({ where: { id: ut.tripId } }).catch(() => undefined);
    }
    await prisma.chatSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
});

test("selecting a version records activity log", async () => {
  process.env.NODE_ENV = "test";
  const { user, session } = await seed();
  const service = createItineraryService({
    findUserById: (id) => prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } }),
  });

  const v1 = await service.saveDraftVersion({
    userId: user.id,
    sessionId: session.id,
    travelDate: "2026-12-01",
    startTime: "08:00",
    endTime: "17:00",
    stops: [],
    routeJson: null,
    changeType: "generate",
  });

  await service.selectVersionById({ id: v1.itineraryId, userId: user.id, version: 1 });

  const logs = await prisma.activityLog.findMany({
    where: { userId: user.id, action: "version_selected" },
  });
  assert.equal(logs.length, 1);
  assert.equal(logs[0]!.entityType, "trip_version");
});

test("saving a version records activity log", async () => {
  process.env.NODE_ENV = "test";
  const { user, session } = await seed();
  const service = createItineraryService({
    findUserById: (id) => prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } }),
  });

  const v1 = await service.saveDraftVersion({
    userId: user.id,
    sessionId: session.id,
    travelDate: "2026-12-02",
    startTime: "08:00",
    endTime: "17:00",
    stops: [],
    routeJson: null,
    changeType: "generate",
  });

  await service.setVersionSaved({ id: v1.itineraryId, userId: user.id, version: 1, isSaved: true });

  const logs = await prisma.activityLog.findMany({
    where: { userId: user.id, action: "version_saved" },
  });
  assert.equal(logs.length, 1);
  assert.equal(logs[0]!.entityType, "trip_version");
});