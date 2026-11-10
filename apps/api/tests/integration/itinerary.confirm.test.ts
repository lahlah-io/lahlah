import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { prisma } from "../../src/db/client.js";
import { app as rootApp } from "../../src/app.js";
import { errorHandler } from "../../src/shared/http/errors.js";
import { createItineraryApi, createItineraryService } from "../../src/modules/itinerary/index.js";
import { createDraftStore, type ItineraryDraftResponse } from "../../src/modules/chat/services/draft-store.js";

const json = { "content-type": "application/json" };
const PREV_NODE_ENV = process.env.NODE_ENV;

async function padangDestinations(limit = 2) {
  const rows = await prisma.destination.findMany({
    where: { city: "Padang", isActive: true, latitude: { not: null }, longitude: { not: null } },
    take: limit,
    select: { id: true, name: true, latitude: true, longitude: true, details: true },
    orderBy: { createdAt: "asc" },
  });
  assert.ok(rows.length >= 2, "need >=2 active Padang destinations (run seed)");
  return rows.map((r) => ({
    ...r,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
  }));
}

async function createUser() {
  return prisma.user.create({
    data: { name: "Itin Test", email: `itin-${randomUUID()}@example.test` },
    select: { id: true, isActive: true },
  });
}

async function createSession(userId: string) {
  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "itinerary-test" } },
    update: {},
    create: { provider: "test", modelIdentifier: "itinerary-test", name: "itinerary-test", isActive: true },
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

function buildApp(store: ReturnType<typeof createDraftStore>) {
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

afterAll(() => {
  if (PREV_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = PREV_NODE_ENV;
});

test("confirm persists itinerary+destinations atomically from valid draft", async () => {
  process.env.NODE_ENV = "test";
  const user = await createUser();
  const session = await createSession(user.id);
  const rows = await padangDestinations(2);
  const store = createDraftStore();
  const draftId = await store.replaceSessionDraft({ userId: user.id, sessionId: session.id, itinerary: draftFor(rows) });
  const app = buildApp(store);
  try {
    const res = await app.request("/api/v1/itineraries/confirm", {
      method: "POST", headers: json, body: JSON.stringify({ draftId, userId: user.id, sessionId: session.id }),
    });
    const body = await res.json() as { data?: { id: string; sessionId: string | null; destinations: Array<{ destinationId: string }> } };
    assert.equal(res.status, 201, JSON.stringify(body));
    assert.equal(body.data?.sessionId, session.id);
    assert.equal(body.data?.destinations.length, 2);
    const saved = await prisma.itinerary.findUnique({
      where: { id: body.data!.id },
      include: { destinations: { orderBy: { createdAt: "asc" } } },
    });
    assert.ok(saved);
    assert.equal(saved.destinations.length, 2);
    assert.deepEqual(saved.destinations.map((d) => d.destinationId).sort(), rows.map((r) => r.id).sort());
  } finally {
    await cleanup([user.id]);
  }
});

test("confirm handles expired, wrong user/session, duplicate, and inactive destination safely", async () => {
  process.env.NODE_ENV = "test";
  const user = await createUser();
  const user2 = await createUser();
  const session = await createSession(user.id);
  const session2 = await createSession(user2.id);
  const rows = await padangDestinations(2);
  let now = 1_000_000;
  const store = createDraftStore({ ttlSeconds: 30, now: () => now });
  const app = buildApp(store);
  try {
    const expiredId = await store.replaceSessionDraft({ userId: user.id, sessionId: session.id, itinerary: draftFor(rows) });
    now += 31_000;
    let res = await app.request("/api/v1/itineraries/confirm", { method: "POST", headers: json, body: JSON.stringify({ draftId: expiredId, userId: user.id, sessionId: session.id }) });
    assert.equal(res.status, 404);

    now = 2_000_000;
    const draftId = await store.replaceSessionDraft({ userId: user.id, sessionId: session.id, itinerary: draftFor(rows) });
    res = await app.request("/api/v1/itineraries/confirm", { method: "POST", headers: json, body: JSON.stringify({ draftId, userId: user2.id, sessionId: session.id }) });
    assert.equal(res.status, 403);
    res = await app.request("/api/v1/itineraries/confirm", { method: "POST", headers: json, body: JSON.stringify({ draftId, userId: user.id, sessionId: session2.id }) });
    assert.equal(res.status, 403);

    res = await app.request("/api/v1/itineraries/confirm", { method: "POST", headers: json, body: JSON.stringify({ draftId, userId: user.id, sessionId: session.id }) });
    assert.equal(res.status, 201);
    const first = await res.json() as { data: { id: string } };
    const draftId2 = await store.replaceSessionDraft({ userId: user.id, sessionId: session.id, itinerary: draftFor(rows) });
    res = await app.request("/api/v1/itineraries/confirm", { method: "POST", headers: json, body: JSON.stringify({ draftId: draftId2, userId: user.id, sessionId: session.id }) });
    assert.equal(res.status, 200);
    const second = await res.json() as { data: { id: string } };
    assert.equal(second.data.id, first.data.id);
    assert.equal(await prisma.itinerary.count({ where: { sessionId: session.id } }), 1);

    const inactiveDest = await prisma.destination.create({
      data: { name: `Inactive ${randomUUID()}`, source: "manual", city: "Padang", isActive: false, latitude: -0.9, longitude: 100.3, details: {} },
      select: { id: true, name: true, latitude: true, longitude: true },
    });
    const session3 = await createSession(user2.id);
    const badDraft = draftFor([{ ...rows[0]!, id: inactiveDest.id, name: inactiveDest.name, latitude: Number(inactiveDest.latitude), longitude: Number(inactiveDest.longitude) }, rows[1]!]);
    const badId = await store.replaceSessionDraft({ userId: user2.id, sessionId: session3.id, itinerary: badDraft });
    res = await app.request("/api/v1/itineraries/confirm", { method: "POST", headers: json, body: JSON.stringify({ draftId: badId, userId: user2.id, sessionId: session3.id }) });
    assert.equal(res.status, 422);
    await prisma.destination.delete({ where: { id: inactiveDest.id } }).catch(() => undefined);
  } finally {
    await cleanup([user.id, user2.id]);
  }
});
