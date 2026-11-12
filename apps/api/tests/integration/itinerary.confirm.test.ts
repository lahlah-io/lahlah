import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { prisma } from "../../src/db/client.js";
import { errorHandler } from "../../src/shared/http/errors.js";
import { createItineraryApi, createItineraryService } from "../../src/modules/itinerary/index.js";
import type { ItineraryVersionStop } from "../../src/shared/schemas/itinerary-version.js";

const json = { "content-type": "application/json" };
const PREV_NODE_ENV = process.env.NODE_ENV;
const createdUserIds: string[] = [];

async function padangDestinations(limit = 2) {
  const rows = await prisma.destination.findMany({
    where: { city: "Padang", isActive: true, latitude: { not: null }, longitude: { not: null } },
    take: limit,
    select: { id: true, name: true, latitude: true, longitude: true },
    orderBy: { createdAt: "asc" },
  });
  assert.ok(rows.length >= 2, "need >=2 active Padang destinations (run seed)");
  return rows.map((r) => ({ ...r, latitude: Number(r.latitude), longitude: Number(r.longitude) }));
}

async function createUser() {
  const user = await prisma.user.create({
    data: { name: "Confirm Removal", email: `confirm-rm-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return user;
}

async function createSession(userId: string) {
  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "confirm-removed" } },
    update: {},
    create: { provider: "test", modelIdentifier: "confirm-removed", name: "confirm-removed", isActive: true },
    select: { id: true },
  });
  return prisma.chatSession.create({ data: { userId, modelId: model.id, title: "t" }, select: { id: true } });
}

function stopsFrom(rows: Awaited<ReturnType<typeof padangDestinations>>): ItineraryVersionStop[] {
  return rows.map((r, i) => ({
    position: i + 1,
    destinationId: r.id,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    arrivalTime: `${String(8 + i).padStart(2, "0")}:30`,
    visitDurationMin: 60,
    category: null,
  }));
}

function buildService() {
  return createItineraryService({
    findUserById: (id) => prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } }),
  });
}

function buildApp(service = buildService()) {
  const app = new Hono();
  app.onError(errorHandler);
  app.route("/api/v1/itineraries", createItineraryApi(service));
  return app;
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
  if (PREV_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = PREV_NODE_ENV;
});

test("POST /confirm returns 404 because the draft-confirmation endpoint was removed", async () => {
  process.env.NODE_ENV = "test";
  const user = await createUser();
  const res = await buildApp().request("/api/v1/itineraries/confirm", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ draftId: randomUUID(), userId: user.id, sessionId: randomUUID() }),
  });
  assert.equal(res.status, 404);
});

test("activation happens via /versions/:version/select, not a confirm endpoint", async () => {
  process.env.NODE_ENV = "test";
  const user = await createUser();
  const session = await createSession(user.id);
  const rows = await padangDestinations(2);
  const service = buildService();
  const app = buildApp(service);

  const v1 = await service.saveDraftVersion({
    userId: user.id,
    sessionId: session.id,
    travelDate: "2026-12-01",
    startTime: "08:00",
    endTime: "17:00",
    stops: stopsFrom(rows),
    routeJson: null,
    changeType: "generate",
  });

  const selected = await app.request(`/api/v1/itineraries/${v1.itineraryId}/versions/1/select`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ userId: user.id }),
  });
  assert.equal(selected.status, 200);

  const inDb = await prisma.itinerary.findUniqueOrThrow({
    where: { id: v1.itineraryId },
    include: { versions: { include: { stops: true } }, destinations: true },
  });
  assert.equal(inDb.versions.length, 1);
  assert.equal(inDb.versions[0]!.version, 1);
  assert.equal(inDb.versions[0]!.isSelected, true);
  assert.equal(inDb.versions[0]!.stops.length, 2);
  assert.equal(inDb.destinations.length, 2);
});