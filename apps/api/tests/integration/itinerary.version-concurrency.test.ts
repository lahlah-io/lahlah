import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { prisma } from "../../src/db/client.js";
import { errorHandler } from "../../src/shared/http/errors.js";
import { createItineraryApi, createItineraryService } from "../../src/modules/itinerary/index.js";
import type { ItineraryVersionStop } from "../../src/shared/schemas/itinerary-version.js";

const json = { "content-type": "application/json" };
const createdUserIds: string[] = [];

async function padangDestinations(limit = 2) {
  const rows = await prisma.destination.findMany({
    where: { city: "Padang", isActive: true, latitude: { not: null }, longitude: { not: null } },
    take: limit,
    select: { id: true, name: true, latitude: true, longitude: true },
    orderBy: { createdAt: "asc" },
  });
  assert.ok(rows.length >= 2, "need >=2 active Padang destinations (run seed)");
  return rows.map((row) => ({ ...row, latitude: Number(row.latitude), longitude: Number(row.longitude) }));
}

async function seedSession() {
  const user = await prisma.user.create({
    data: { name: "Concurrency Test", email: `conc-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "version-concurrency" } },
    update: {},
    create: { provider: "test", modelIdentifier: "version-concurrency", name: "version-concurrency", isActive: true },
    select: { id: true },
  });
  const session = await prisma.chatSession.create({
    data: { userId: user.id, modelId: model.id, title: "conc" },
    select: { id: true },
  });
  return { user, session };
}

function stopsFrom(rows: Awaited<ReturnType<typeof padangDestinations>>): ItineraryVersionStop[] {
  return rows.map((row, index) => ({
    position: index + 1,
    destinationId: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    arrivalTime: `0${8 + index}:00`,
    visitDurationMin: 60,
    category: null,
  }));
}

function buildService() {
  return createItineraryService({
    getDraft: () => {
      throw new Error("unused");
    },
    findUserById: (id) => prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } }),
  });
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

test("two parallel generates keep one itinerary and distinct version numbers", async () => {
  process.env.NODE_ENV = "test";
  const { user, session } = await seedSession();
  const rows = await padangDestinations(2);
  const service = buildService();
  const stops = stopsFrom(rows);
  const input = {
    userId: user.id,
    sessionId: session.id,
    travelDate: "2026-12-01",
    startTime: "08:00",
    endTime: "17:00",
    stops,
    routeJson: null,
    changeType: "generate" as const,
  };

  const results = await Promise.allSettled([service.saveDraftVersion(input), service.saveDraftVersion(input)]);
  assert.equal(results.filter((result) => result.status === "rejected").length, 0, JSON.stringify(results));

  const itineraries = await prisma.itinerary.findMany({ where: { userId: user.id }, select: { id: true } });
  assert.equal(itineraries.length, 1);

  const versions = await prisma.itineraryVersion.findMany({
    where: { itineraryId: itineraries[0]!.id },
    select: { version: true },
    orderBy: { version: "asc" },
  });
  assert.deepEqual(versions.map((row) => row.version), [1, 2]);
});

test("parallel selection leaves exactly one active version", async () => {
  process.env.NODE_ENV = "test";
  const { user, session } = await seedSession();
  const rows = await padangDestinations(2);
  const service = buildService();
  const app = new Hono();
  app.onError(errorHandler);
  app.route("/api/v1/itineraries", createItineraryApi(service));

  const first = await service.saveDraftVersion({
    userId: user.id,
    sessionId: session.id,
    travelDate: "2026-12-01",
    startTime: "08:00",
    endTime: "17:00",
    stops: stopsFrom(rows),
    routeJson: null,
    changeType: "generate",
  });
  await service.saveDraftVersion({
    userId: user.id,
    sessionId: session.id,
    travelDate: "2026-12-01",
    startTime: "08:00",
    endTime: "17:00",
    stops: stopsFrom([...rows].reverse()),
    routeJson: null,
    changeType: "regenerate",
  });

  const responses = await Promise.all(
    [1, 2].map((version) =>
      app.request(`/api/v1/itineraries/${first.itineraryId}/versions/${version}/select`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ userId: user.id }),
      }),
    ),
  );
  for (const response of responses) {
    assert.equal(response.status, 200, `unexpected status ${response.status}`);
  }

  const selected = await prisma.itineraryVersion.count({
    where: { itineraryId: first.itineraryId, isSelected: true },
  });
  assert.equal(selected, 1);
});
