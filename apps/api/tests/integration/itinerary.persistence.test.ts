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
  return prisma.user.create({
    data: { name: "Persist Test", username: `u-${randomUUID()}`, email: `persist-${randomUUID()}@example.test` },
    select: { id: true, isActive: true },
  });
}

async function createSession(userId: string) {
  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "itinerary-persist-test" } },
    update: {},
    create: { provider: "test", modelIdentifier: "itinerary-persist-test", name: "itinerary-persist-test", isActive: true },
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

function routeFor(rows: Awaited<ReturnType<typeof padangDestinations>>) {
  return {
    type: "LineString",
    coordinates: rows.map((r) => [r.longitude, r.latitude]),
    legs: [
      {
        fromPosition: 1,
        toPosition: 2,
        transportMode: "car",
        distanceM: null,
        durationSec: null,
        geometry: { type: "LineString", coordinates: rows.map((r) => [r.longitude, r.latitude]) },
        provider: "fallback",
        profile: "straight_line",
        fallback: true,
      },
    ],
  };
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

async function cleanup(userIds: string[]) {
  for (const userId of userIds) {
    const its = await prisma.trip.findMany({ where: { members: { some: { userId } } }, select: { id: true } });
    for (const it of its) {
      await prisma.destinationCheckpoint.deleteMany({ where: { tripDestination: { tripId: it.id } } });
      await prisma.tripDestination.deleteMany({ where: { tripId: it.id } });
    }
    await prisma.trip.deleteMany({ where: { members: { some: { userId } } } });
    await prisma.chatSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
}

afterAll(() => {
  if (PREV_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = PREV_NODE_ENV;
});

test("activation persists immutable version, stops and routes (DB-sourced, restart-safe)", async () => {
  process.env.NODE_ENV = "test";
  const user = await createUser();
  const session = await createSession(user.id);
  const rows = await padangDestinations(2);
  const service = buildService();
  const app = buildApp(service);
  try {
    const v1 = await service.saveDraftVersion({
      userId: user.id,
      sessionId: session.id,
      travelDate: "2026-12-01",
      startTime: "08:00",
      endTime: "17:00",
      stops: stopsFrom(rows),
      routeJson: routeFor(rows),
      changeType: "generate",
    });

    const res = await app.request(`/api/v1/itineraries/${v1.itineraryId}/versions/1/select`, {
      method: "POST", headers: json, body: JSON.stringify({ userId: user.id }),
    });
    const body = await res.json() as { data?: { id: string; sessionId: string | null } };
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.data?.sessionId, session.id);

    const inDb = await prisma.trip.findUnique({
      where: { id: body.data!.id },
      include: {
        destinations: true,
        versions: { include: { stops: { orderBy: { position: "asc" } } }, orderBy: { version: "asc" } },
      },
    });
    assert.ok(inDb, "itinerary persisted");
    assert.equal(inDb.sessionId, session.id);
    assert.equal(inDb.currentVersion, 1);
    assert.equal(inDb.versions.length, 1);
    const ver = inDb.versions[0]!;
    assert.equal(ver.version, 1);
    assert.equal(ver.status, "generated");
    assert.equal(ver.stops.length, 2);
    assert.deepEqual(ver.stops.map((s) => s.position), [1, 2]);
    assert.deepEqual(ver.stops.map((s) => s.name), rows.map((r) => r.name));
    assert.equal((ver.routeJson as { legs: unknown[] }).legs.length, 1);
    assert.equal(inDb.destinations.length, 2);

    // restart-safe: a fresh service/app reads the same DB-backed state
    const freshApp = buildApp();
    const again = await freshApp.request(`/api/v1/itineraries/${body.data!.id}?userId=${user.id}`);
    assert.equal(again.status, 200);
    const againBody = await again.json() as { data: { id: string; currentVersion: number } };
    assert.equal(againBody.data.id, body.data!.id);
    assert.equal(againBody.data.currentVersion, 1);
    assert.equal(await prisma.trip.count({ where: { sessionId: session.id } }), 1);
    const versionsAfter = await prisma.tripVersion.count({ where: { tripId: body.data!.id } });
    assert.equal(versionsAfter, 1);
  } finally {
    await cleanup([user.id]);
  }
});

test("select-based activation rejects ownership and missing version safely", async () => {
  process.env.NODE_ENV = "test";
  const user = await createUser();
  const user2 = await createUser();
  const session = await createSession(user.id);
  const rows = await padangDestinations(2);
  const service = buildService();
  const app = buildApp(service);
  try {
    const v1 = await service.saveDraftVersion({
      userId: user.id,
      sessionId: session.id,
      travelDate: "2026-12-01",
      startTime: "08:00",
      endTime: "17:00",
      stops: stopsFrom(rows),
      routeJson: routeFor(rows),
      changeType: "generate",
    });

    const forbidden = await app.request(`/api/v1/itineraries/${v1.itineraryId}/versions/1/select`, {
      method: "POST", headers: json, body: JSON.stringify({ userId: user2.id }),
    });
    assert.equal(forbidden.status, 404);

    const missing = await app.request(`/api/v1/itineraries/${v1.itineraryId}/versions/99/select`, {
      method: "POST", headers: json, body: JSON.stringify({ userId: user.id }),
    });
    assert.equal(missing.status, 404);
  } finally {
    await cleanup([user.id, user2.id]);
  }
});