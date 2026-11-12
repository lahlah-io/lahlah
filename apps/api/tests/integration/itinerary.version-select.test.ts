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

async function padangDestinations(limit = 3) {
  const rows = await prisma.destination.findMany({
    where: { city: "Padang", isActive: true, latitude: { not: null }, longitude: { not: null } },
    take: limit,
    select: { id: true, name: true, latitude: true, longitude: true },
    orderBy: { createdAt: "asc" },
  });
  assert.ok(rows.length >= 3, "need >=3 active Padang destinations (run seed)");
  return rows.map((row) => ({ ...row, latitude: Number(row.latitude), longitude: Number(row.longitude) }));
}

async function createUser() {
  const user = await prisma.user.create({
    data: { name: "Select Test", email: `select-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return user;
}

async function createSession(userId: string) {
  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "version-select" } },
    update: {},
    create: { provider: "test", modelIdentifier: "version-select", name: "version-select", isActive: true },
    select: { id: true },
  });
  return prisma.chatSession.create({ data: { userId, modelId: model.id, title: "select" }, select: { id: true } });
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

function stopsFrom(
  rows: Awaited<ReturnType<typeof padangDestinations>>,
  indexes: number[],
): ItineraryVersionStop[] {
  return indexes.map((index, position) => {
    const row = rows[index]!;
    return {
      position: position + 1,
      destinationId: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      arrivalTime: `0${8 + position}:00`,
      visitDurationMin: 60,
      category: null,
    };
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

test("selecting a version switches the active destination set and keeps checkpoints", async () => {
  process.env.NODE_ENV = "test";
  const user = await createUser();
  const session = await createSession(user.id);
  const rows = await padangDestinations(3);
  const service = buildService();
  const app = buildApp(service);

  const v1 = await service.saveDraftVersion({
    userId: user.id,
    sessionId: session.id,
    travelDate: "2026-12-01",
    startTime: "08:00",
    endTime: "17:00",
    stops: stopsFrom(rows, [0, 1]),
    routeJson: null,
    changeType: "generate",
  });

  const first = await app.request(`/api/v1/itineraries/${v1.itineraryId}/versions/1/select`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ userId: user.id }),
  });
  assert.equal(first.status, 200, await first.text());

  const keptRow = await prisma.itineraryDestination.findFirstOrThrow({
    where: { itineraryId: v1.itineraryId, destinationId: rows[0]!.id },
    select: { id: true },
  });
  await prisma.destinationCheckpoint.create({
    data: { itineraryDestinationId: keptRow.id, userId: user.id, imageUrl: "https://example.test/a.jpg" },
  });

  const v2 = await service.saveDraftVersion({
    userId: user.id,
    sessionId: session.id,
    travelDate: "2026-12-01",
    startTime: "08:00",
    endTime: "17:00",
    stops: stopsFrom(rows, [1, 2]),
    routeJson: null,
    changeType: "regenerate",
  });
  assert.equal(v2.versionNumber, 2);

  const afterGenerate = await prisma.itineraryVersion.findMany({
    where: { itineraryId: v1.itineraryId },
    select: { version: true, isSelected: true },
    orderBy: { version: "asc" },
  });
  assert.deepEqual(afterGenerate, [
    { version: 1, isSelected: true },
    { version: 2, isSelected: false },
  ]);

  const second = await app.request(`/api/v1/itineraries/${v1.itineraryId}/versions/2/select`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ userId: user.id }),
  });
  assert.equal(second.status, 200, await second.text());

  const active = await prisma.itineraryDestination.findMany({
    where: { itineraryId: v1.itineraryId, isActive: true },
    select: { destinationId: true, position: true },
    orderBy: { position: "asc" },
  });
  assert.deepEqual(
    active.map((row) => [row.destinationId, row.position]),
    [
      [rows[1]!.id, 1],
      [rows[2]!.id, 2],
    ],
  );

  const rowsAfter = await prisma.itineraryDestination.findMany({
    where: { itineraryId: v1.itineraryId },
    select: { destinationId: true, isActive: true },
  });
  assert.equal(rowsAfter.length, 3, "no destination row is deleted");
  assert.equal(rowsAfter.find((row) => row.destinationId === rows[0]!.id)?.isActive, false);
  assert.equal(
    await prisma.destinationCheckpoint.count({ where: { itineraryDestination: { itineraryId: v1.itineraryId } } }),
    1,
  );

  const detail = await app.request(`/api/v1/itineraries/${v1.itineraryId}?userId=${user.id}`);
  const detailBody = (await detail.json()) as { data: { currentVersion: number; destinations: Array<{ destinationId: string }> } };
  assert.equal(detailBody.data.currentVersion, 2);
  assert.equal(detailBody.data.destinations.length, 2);
});

test("restoring a version selects the new version and syncs its destinations", async () => {
  process.env.NODE_ENV = "test";
  const user = await createUser();
  const session = await createSession(user.id);
  const rows = await padangDestinations(3);
  const service = buildService();
  const app = buildApp(service);

  const v1 = await service.saveDraftVersion({
    userId: user.id,
    sessionId: session.id,
    travelDate: "2026-12-01",
    startTime: "08:00",
    endTime: "17:00",
    stops: stopsFrom(rows, [0, 1]),
    routeJson: null,
    changeType: "generate",
  });

  const selected = await app.request(`/api/v1/itineraries/${v1.itineraryId}/versions/1/select`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ userId: user.id }),
  });
  assert.equal(selected.status, 200, await selected.text());

  const keptRow = await prisma.itineraryDestination.findFirstOrThrow({
    where: { itineraryId: v1.itineraryId, destinationId: rows[0]!.id },
    select: { id: true },
  });
  await prisma.destinationCheckpoint.create({
    data: { itineraryDestinationId: keptRow.id, userId: user.id, imageUrl: "https://example.test/a.jpg" },
  });

  const v2 = await service.saveDraftVersion({
    userId: user.id,
    sessionId: session.id,
    travelDate: "2026-12-01",
    startTime: "08:00",
    endTime: "17:00",
    stops: stopsFrom(rows, [1, 2]),
    routeJson: null,
    changeType: "regenerate",
  });
  assert.equal(v2.versionNumber, 2);

  const restored = await app.request(`/api/v1/itineraries/${v1.itineraryId}/restore/1`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ userId: user.id }),
  });
  assert.equal(restored.status, 200, await restored.text());

  const versions = await prisma.itineraryVersion.findMany({
    where: { itineraryId: v1.itineraryId },
    select: { version: true, isSelected: true },
    orderBy: { version: "asc" },
  });
  assert.deepEqual(versions, [
    { version: 1, isSelected: false },
    { version: 2, isSelected: false },
    { version: 3, isSelected: true },
  ]);

  const active = await prisma.itineraryDestination.findMany({
    where: { itineraryId: v1.itineraryId, isActive: true },
    select: { destinationId: true, position: true },
    orderBy: { position: "asc" },
  });
  assert.deepEqual(
    active.map((row) => [row.destinationId, row.position]),
    [
      [rows[0]!.id, 1],
      [rows[1]!.id, 2],
    ],
  );

  const rowsAfter = await prisma.itineraryDestination.findMany({
    where: { itineraryId: v1.itineraryId },
    select: { destinationId: true, isActive: true },
  });
  assert.equal(rowsAfter.length, 2, "no destination row is deleted");
  assert.equal(rowsAfter.find((row) => row.destinationId === rows[0]!.id)?.isActive, true);
  assert.equal(
    await prisma.destinationCheckpoint.count({ where: { itineraryDestination: { itineraryId: v1.itineraryId } } }),
    1,
  );

  const detail = await app.request(`/api/v1/itineraries/${v1.itineraryId}?userId=${user.id}`);
  const detailBody = (await detail.json()) as {
    data: { currentVersion: number; version: { version: number }; destinations: Array<{ destinationId: string }> };
  };
  assert.equal(detailBody.data.currentVersion, 3);
  assert.equal(detailBody.data.version.version, 3);
  assert.deepEqual(
    detailBody.data.destinations.map((row) => row.destinationId),
    [rows[0]!.id, rows[1]!.id],
  );
});

test("save and unsave a version without touching version history", async () => {
  process.env.NODE_ENV = "test";
  const user = await createUser();
  const session = await createSession(user.id);
  const rows = await padangDestinations(3);
  const service = buildService();
  const app = buildApp(service);

  const v1 = await service.saveDraftVersion({
    userId: user.id,
    sessionId: session.id,
    travelDate: "2026-12-01",
    startTime: "08:00",
    endTime: "17:00",
    stops: stopsFrom(rows, [0, 1]),
    routeJson: null,
    changeType: "generate",
  });
  await service.saveDraftVersion({
    userId: user.id,
    sessionId: session.id,
    travelDate: "2026-12-01",
    startTime: "08:00",
    endTime: "17:00",
    stops: stopsFrom(rows, [1, 2]),
    routeJson: null,
    changeType: "regenerate",
  });

  const saved = await app.request(`/api/v1/itineraries/${v1.itineraryId}/versions/1/save`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ userId: user.id }),
  });
  assert.equal(saved.status, 200, await saved.text());

  const list = await app.request(`/api/v1/itineraries/${v1.itineraryId}/versions?userId=${user.id}`);
  const listBody = (await list.json()) as { data: Array<{ version: number; isSaved: boolean; isSelected: boolean }> };
  assert.deepEqual(
    listBody.data.map((row) => [row.version, row.isSaved, row.isSelected]),
    [
      [1, true, false],
      [2, false, false],
    ],
  );

  const unsaved = await app.request(`/api/v1/itineraries/${v1.itineraryId}/versions/1/save?userId=${user.id}`, {
    method: "DELETE",
  });
  assert.equal(unsaved.status, 200, await unsaved.text());

  const after = await app.request(`/api/v1/itineraries/${v1.itineraryId}/versions?userId=${user.id}`);
  const afterBody = (await after.json()) as { data: Array<{ version: number; isSaved: boolean }> };
  assert.equal(afterBody.data.length, 2, "unsave keeps version history");
  assert.equal(afterBody.data[0]!.isSaved, false);

  const missing = await app.request(`/api/v1/itineraries/${v1.itineraryId}/versions/99/save`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ userId: user.id }),
  });
  assert.equal(missing.status, 404);

  const other = await createUser();
  const forbidden = await app.request(`/api/v1/itineraries/${v1.itineraryId}/versions/1/save`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ userId: other.id }),
  });
  assert.equal(forbidden.status, 404);
});
