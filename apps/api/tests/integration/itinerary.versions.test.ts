import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { prisma } from "../../src/db/client.js";
import { errorHandler } from "../../src/shared/http/errors.js";
import { createItineraryApi, createItineraryService } from "../../src/modules/itinerary/index.js";
import { createDraftStore, type ItineraryDraftResponse } from "../../src/modules/chat/services/draft-store.js";

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
    data: { name: "Version Test", email: `ver-${randomUUID()}@example.test` },
    select: { id: true, isActive: true },
  });
}

async function createSession(userId: string) {
  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "itinerary-version-test" } },
    update: {},
    create: { provider: "test", modelIdentifier: "itinerary-version-test", name: "itinerary-version-test", isActive: true },
    select: { id: true },
  });
  return prisma.chatSession.create({ data: { userId, modelId: model.id, title: "t" }, select: { id: true } });
}

function draftFor(rows: Awaited<ReturnType<typeof padangDestinations>>): ItineraryDraftResponse {
  return {
    draftId: "pending",
    status: "pending_confirmation",
    travelDate: "2026-12-01",
    startTime: "08:00",
    endTime: "17:00",
    destinations: rows.map((r, i) => ({
      order: i + 1,
      destinationId: r.id,
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      visitAt: i === 0 ? "08:00" : "09:30",
      durationMinutes: 60,
    })),
    route: { type: "LineString", coordinates: rows.map((r) => [r.longitude, r.latitude] as [number, number]) },
  };
}

function buildApp(store = createDraftStore()) {
  const service = createItineraryService({
    getDraft: (input) => store.getDraft(input),
    findUserById: (id) => prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } }),
  });
  const app = new Hono();
  app.onError(errorHandler);
  app.route("/api/v1/itineraries", createItineraryApi(service));
  return app;
}

async function cleanup(userIds: string[]) {
  for (const userId of userIds) {
    const its = await prisma.itinerary.findMany({ where: { userId }, select: { id: true } });
    for (const it of its) {
      await prisma.destinationCheckpoint.deleteMany({ where: { itineraryDestination: { itineraryId: it.id } } });
      await prisma.itineraryDestination.deleteMany({ where: { itineraryId: it.id } });
    }
    await prisma.itinerary.deleteMany({ where: { userId } });
    await prisma.chatSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
}

async function confirmedItinerary(userId: string, sessionId: string, rows: Awaited<ReturnType<typeof padangDestinations>>) {
  const store = createDraftStore();
  const app = buildApp(store);
  const draftId = await store.replaceSessionDraft({ userId, sessionId, itinerary: draftFor(rows) });
  const res = await app.request("/api/v1/itineraries/confirm", {
    method: "POST", headers: json, body: JSON.stringify({ draftId, userId, sessionId }),
  });
  assert.equal(res.status, 201, "confirm failed");
  const body = await res.json() as { data: { id: string } };
  return { app, id: body.data.id };
}

afterAll(() => {
  if (PREV_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = PREV_NODE_ENV;
});

test("itinerary detail reconstructs current snapshot (stops + route legs) from DB", async () => {
  process.env.NODE_ENV = "test";
  const user = await createUser();
  const session = await createSession(user.id);
  const rows = await padangDestinations(2);
  try {
    const { app, id } = await confirmedItinerary(user.id, session.id, rows);
    const res = await app.request(`/api/v1/itineraries/${id}?userId=${user.id}`);
    assert.equal(res.status, 200);
    const body = await res.json() as { data: { id: string; currentVersion: number; version: { version: number; status: string; stops: Array<{ position: number; name: string }>; routes: Array<{ provider: string; fallback: boolean }> } } };
    assert.equal(body.data.id, id);
    assert.equal(body.data.currentVersion, 1);
    assert.equal(body.data.version.version, 1);
    assert.equal(body.data.version.status, "confirmed");
    assert.deepEqual(body.data.version.stops.map((s) => s.position), [1, 2]);
    assert.deepEqual(body.data.version.stops.map((s) => s.name), rows.map((r) => r.name));
    assert.equal(body.data.version.routes.length, 1);
    assert.equal(body.data.version.routes[0]!.fallback, true);

    const bySession = await app.request(`/api/v1/itineraries/by-session/${session.id}?userId=${user.id}`);
    assert.equal(bySession.status, 200);
    const bySessionBody = await bySession.json() as { data: { id: string; version: { version: number } } };
    assert.equal(bySessionBody.data.id, id);
    assert.equal(bySessionBody.data.version.version, 1);
  } finally {
    await cleanup([user.id]);
  }
});

test("itinerary versions: list, fetch specific, restore creates new immutable version", async () => {
  process.env.NODE_ENV = "test";
  const user = await createUser();
  const session = await createSession(user.id);
  const rows = await padangDestinations(2);
  try {
    const { app, id } = await confirmedItinerary(user.id, session.id, rows);

    const list = await app.request(`/api/v1/itineraries/${id}/versions?userId=${user.id}`);
    assert.equal(list.status, 200);
    const listBody = await list.json() as { data: Array<{ version: number; status: string }> };
    assert.deepEqual(listBody.data.map((v) => v.version), [1]);
    assert.equal(listBody.data[0]!.status, "confirmed");

    const one = await app.request(`/api/v1/itineraries/${id}/versions/1?userId=${user.id}`);
    assert.equal(one.status, 200);
    const oneBody = await one.json() as { data: { version: number; stops: Array<{ id: string }> } };
    assert.equal(oneBody.data.version, 1);
    assert.equal(oneBody.data.stops.length, 2);

    const restored = await app.request(`/api/v1/itineraries/${id}/restore/1`, {
      method: "POST", headers: json, body: JSON.stringify({ userId: user.id, expectedVersion: 1 }),
    });
    assert.equal(restored.status, 200);
    const restoredBody = await restored.json() as { data: { currentVersion: number; version: { version: number; changeType: string; stops: Array<{ id: string }> } } };
    assert.equal(restoredBody.data.currentVersion, 2);
    assert.equal(restoredBody.data.version.version, 2);
    assert.equal(restoredBody.data.version.changeType, "restore");
    assert.equal(restoredBody.data.version.stops.length, 2);
    assert.notEqual(restoredBody.data.version.stops[0]!.id, oneBody.data.stops[0]!.id);

    const versionsAfter = await app.request(`/api/v1/itineraries/${id}/versions?userId=${user.id}`);
    const versionsAfterBody = await versionsAfter.json() as { data: Array<{ version: number }> };
    assert.deepEqual(versionsAfterBody.data.map((v) => v.version), [1, 2]);

    // v1 immutable
    const v1 = await app.request(`/api/v1/itineraries/${id}/versions/1?userId=${user.id}`);
    const v1Body = await v1.json() as { data: { changeType: string } };
    assert.equal(v1Body.data.changeType, "confirm");

    const stale = await app.request(`/api/v1/itineraries/${id}/restore/1`, {
      method: "POST", headers: json, body: JSON.stringify({ userId: user.id, expectedVersion: 1 }),
    });
    assert.equal(stale.status, 409);

    const missingVersion = await app.request(`/api/v1/itineraries/${id}/versions/99?userId=${user.id}`);
    assert.equal(missingVersion.status, 404);
  } finally {
    await cleanup([user.id]);
  }
});

test("itinerary version endpoints enforce ownership", async () => {
  process.env.NODE_ENV = "test";
  const user = await createUser();
  const other = await createUser();
  const session = await createSession(user.id);
  const rows = await padangDestinations(2);
  try {
    const { app, id } = await confirmedItinerary(user.id, session.id, rows);

    assert.equal((await app.request(`/api/v1/itineraries/${id}?userId=${other.id}`)).status, 404);
    assert.equal((await app.request(`/api/v1/itineraries/${id}/versions?userId=${other.id}`)).status, 404);
    assert.equal((await app.request(`/api/v1/itineraries/by-session/${session.id}?userId=${other.id}`)).status, 404);

    const restore = await app.request(`/api/v1/itineraries/${id}/restore/1`, {
      method: "POST", headers: json, body: JSON.stringify({ userId: other.id }),
    });
    assert.equal(restore.status, 403);
  } finally {
    await cleanup([user.id, other.id]);
  }
});

