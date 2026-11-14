import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { afterAll, test } from "vitest";
import { prisma } from "../../src/db/client.js";
import { errorHandler } from "../../src/shared/http/errors.js";
import { createItineraryApi, createItineraryService } from "../../src/modules/itinerary/index.js";
import type { TripRouteFn } from "../../src/shared/geo/trip-distance.js";
import type { ItineraryVersionStop } from "../../src/shared/schemas/itinerary-version.js";
import { backfillTripDistances } from "../../src/scripts/backfill-trip-distances.js";

const PREV_NODE_ENV = process.env.NODE_ENV;

async function padangDestinations(limit: number) {
  const rows = await prisma.destination.findMany({
    where: { city: "Padang", isActive: true, latitude: { not: null }, longitude: { not: null } },
    take: limit,
    select: { id: true, name: true, latitude: true, longitude: true },
    orderBy: { createdAt: "asc" },
  });
  assert.ok(rows.length >= limit, "need active Padang destinations with coordinates (run seed)");
  return rows;
}

async function createUser() {
  return prisma.user.create({
    data: { name: "Distance Test", username: `u-${randomUUID()}`, email: `dist-${randomUUID()}@example.test` },
    select: { id: true },
  });
}

async function createSession(userId: string) {
  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "itinerary-distance-test" } },
    update: {},
    create: { provider: "test", modelIdentifier: "itinerary-distance-test", name: "itinerary-distance-test", isActive: true },
    select: { id: true },
  });
  return prisma.chatSession.create({ data: { userId, modelId: model.id, title: "d" }, select: { id: true } });
}

function stopsFrom(rows: Awaited<ReturnType<typeof padangDestinations>>): ItineraryVersionStop[] {
  return rows.map((row, index) => ({
    position: index + 1,
    destinationId: row.id,
    name: row.name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    arrivalTime: `${String(8 + index).padStart(2, "0")}:00`,
    visitDurationMin: 60,
    category: null,
  }));
}

function routeFn(source: string, legsDistanceKm: number[]): TripRouteFn {
  return async () => ({ source, legsDistanceKm });
}

function buildApp(getRoute?: TripRouteFn) {
  const service = createItineraryService({
    findUserById: (id) => prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } }),
    getRoute,
  });
  const app = new Hono();
  app.onError(errorHandler);
  app.route("/api/v1/itineraries", createItineraryApi(service));
  return { app, service };
}

async function cleanup(userId: string) {
  await prisma.trip.deleteMany({ where: { members: { some: { userId } } } });
  await prisma.chatSession.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

type DetailBody = {
  data: {
    currentVersion: number;
    destinations: Array<{ destinationId: string; distance: number | null; distanceKm: number | null }>;
    version: {
      totalDistanceM: number | null;
      totalDistanceKm: number | null;
      stops: Array<{ position: number; distance: number | null; distanceKm: number | null }>;
    };
  };
};

afterAll(() => {
  if (PREV_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = PREV_NODE_ENV;
});

test("saving a version stores road distance per leg and totals it per created_at batch", async () => {
  process.env.NODE_ENV = "test";
  const user = await createUser();
  const session = await createSession(user.id);
  const rows = await padangDestinations(3);
  try {
    const { app, service } = buildApp(routeFn("osrm", [1.2, 1.8]));
    const saved = await service.saveDraftVersion({
      userId: user.id,
      sessionId: session.id,
      travelDate: "2026-12-01",
      startTime: "08:00",
      endTime: "17:00",
      stops: stopsFrom(rows),
      routeJson: null,
      changeType: "generate",
    });

    const res = await app.request(`/api/v1/itineraries/${saved.itineraryId}?userId=${user.id}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as DetailBody;

    // First stop has no incoming leg.
    assert.deepEqual(body.data.destinations.map((d) => d.distance), [null, 1200, 1800]);
    assert.deepEqual(body.data.destinations.map((d) => d.distanceKm), [null, 1.2, 1.8]);
    assert.equal(body.data.version.totalDistanceM, 3000);
    assert.equal(body.data.version.totalDistanceKm, 3);
    // Version stops carry the same per-leg values so a client can render without the trip rows.
    assert.deepEqual(body.data.version.stops.map((s) => s.distance), [null, 1200, 1800]);
    assert.deepEqual(body.data.version.stops.map((s) => s.distanceKm), [null, 1.2, 1.8]);

    const versions = await app.request(`/api/v1/itineraries/${saved.itineraryId}/versions?userId=${user.id}`);
    const versionsBody = (await versions.json()) as {
      data: Array<{ totalDistanceM: number | null; totalDistanceKm: number | null }>;
    };
    assert.equal(versionsBody.data[0]!.totalDistanceM, 3000);
    assert.equal(versionsBody.data[0]!.totalDistanceKm, 3);
  } finally {
    await cleanup(user.id);
  }
});

test("a straight-line routing fallback leaves distances empty instead of faking road km", async () => {
  process.env.NODE_ENV = "test";
  const user = await createUser();
  const session = await createSession(user.id);
  const rows = await padangDestinations(2);
  try {
    const { app, service } = buildApp(routeFn("fallback", [1.2]));
    const saved = await service.saveDraftVersion({
      userId: user.id,
      sessionId: session.id,
      travelDate: "2026-12-01",
      startTime: "08:00",
      endTime: "17:00",
      stops: stopsFrom(rows),
      routeJson: null,
      changeType: "generate",
    });

    const res = await app.request(`/api/v1/itineraries/${saved.itineraryId}?userId=${user.id}`);
    const body = (await res.json()) as DetailBody;
    assert.deepEqual(body.data.destinations.map((d) => d.distance), [null, null]);
    assert.equal(body.data.version.totalDistanceM, null);
    assert.equal(body.data.version.totalDistanceKm, null);
  } finally {
    await cleanup(user.id);
  }
});

test("backfill fills missing road distances once and stays idempotent", async () => {
  process.env.NODE_ENV = "test";
  const user = await createUser();
  const session = await createSession(user.id);
  const rows = await padangDestinations(3);
  try {
    const { service } = buildApp();
    const saved = await service.saveDraftVersion({
      userId: user.id,
      sessionId: session.id,
      travelDate: "2026-12-01",
      startTime: "08:00",
      endTime: "17:00",
      stops: stopsFrom(rows),
      routeJson: null,
      changeType: "generate",
    });

    const first = await backfillTripDistances({ getRoute: routeFn("osrm", [1.2, 1.8]) });
    assert.ok(first.batches >= 1);
    assert.deepEqual(
      (await distancesOf(saved.itineraryId)),
      [null, 1200, 1800],
    );

    const second = await backfillTripDistances({ getRoute: routeFn("osrm", [1.2, 1.8]) });
    assert.equal(second.batches, 0);
    assert.equal(second.rows, 0);
  } finally {
    await cleanup(user.id);
  }
});

async function distancesOf(tripId: string) {
  const rows = await prisma.tripDestination.findMany({
    where: { tripId },
    orderBy: [{ createdAt: "asc" }, { visitAt: "asc" }],
    select: { distance: true },
  });
  return rows.map((row) => row.distance);
}
