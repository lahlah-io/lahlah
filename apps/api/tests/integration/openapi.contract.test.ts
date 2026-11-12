import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, test } from "vitest";
import { createServer } from "node:http";
import { Hono } from "hono";
import { z } from "zod";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/client.js";
import { responseShapes } from "../../src/openapi.js";
import { errorHandler } from "../../src/shared/http/errors.js";
import { createChatApi, createChatService } from "../../src/modules/chat/index.js";
import { createDraftStore, type ItineraryDraftResponse } from "../../src/modules/chat/services/draft-store.js";
import { createItineraryApi, createItineraryService } from "../../src/modules/itinerary/index.js";
import { createRouteCache, createRoutingApi, createRoutingService } from "../../src/modules/routing/index.js";

const json = { "content-type": "application/json" };
const PREV_NODE_ENV = process.env.NODE_ENV;
const AI_ENV = [
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_TOOL_MODEL",
  "AI_TOOL_PROVIDER",
  "AI_TOOL_MAX_ROUNDS",
  "AI_TOOL_BASE_URL",
  "AI_TOOL_API_KEY",
  "AI_CLASSIFIER_MODEL",
  "AI_CLASSIFIER_PROVIDER",
  "AI_CLASSIFIER_BASE_URL",
  "AI_CLASSIFIER_API_KEY",
] as const;
const PREV_AI = Object.fromEntries(AI_ENV.map((key) => [key, process.env[key]]));

function expectShape<T extends z.ZodType>(schema: T, value: unknown, label: string): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`${label}: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

async function cleanupUser(userId: string) {
  const itineraries = await prisma.itinerary.findMany({ where: { userId }, select: { id: true } });
  for (const itinerary of itineraries) {
    await prisma.destinationCheckpoint.deleteMany({
      where: { itineraryDestination: { itineraryId: itinerary.id } },
    });
    await prisma.itineraryDestination.deleteMany({ where: { itineraryId: itinerary.id } });
  }
  await prisma.itinerary.deleteMany({ where: { userId } });
  await prisma.chatMessage.deleteMany({ where: { session: { userId } } });
  await prisma.chatSession.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

function buildChatApp(providerBaseUrl: string) {
  process.env.AI_BASE_URL = providerBaseUrl;
  process.env.AI_API_KEY = "test-key";
  process.env.AI_TOOL_MODEL = "test-tool-model";
  process.env.AI_TOOL_PROVIDER = "test";
  process.env.AI_TOOL_MAX_ROUNDS = "3";
  process.env.AI_CLASSIFIER_MODEL = "";
  process.env.AI_TOOL_BASE_URL = "";
  process.env.AI_TOOL_API_KEY = "";

  const chatService = createChatService({
    classifyMessage: async () => ({ intent: "general_chat", source: "rule" }),
    findUserById: (id) => prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } }),
    searchDestinations: async (input) => {
      const q = input.keywords?.trim();
      const cats = input.categories?.filter(Boolean) ?? [];
      const rows = await prisma.destination.findMany({
        where: {
          city: "Padang",
          isActive: true,
          ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
          ...(cats.length ? { categories: { some: { category: { slug: { in: cats } } } } } : {}),
        },
        take: 10,
        select: {
          id: true, name: true, description: true, address: true, latitude: true, longitude: true,
          details: true, city: true, isActive: true,
          categories: { select: { category: { select: { slug: true } } } },
        },
      });
      return rows.map((row) => ({
        ...row,
        latitude: row.latitude == null ? null : Number(row.latitude),
        longitude: row.longitude == null ? null : Number(row.longitude),
        categories: row.categories.map((entry) => entry.category),
      }));
    },
    getDestinationDetails: async (input) => {
      const rows = await prisma.destination.findMany({
        where: { id: { in: input.destinationIds }, city: "Padang", isActive: true },
        select: {
          id: true, name: true, description: true, address: true, latitude: true, longitude: true,
          details: true, city: true, isActive: true,
          categories: { select: { category: { select: { slug: true } } } },
        },
      });
      return rows.map((row) => ({
        ...row,
        latitude: row.latitude == null ? null : Number(row.latitude),
        longitude: row.longitude == null ? null : Number(row.longitude),
        categories: row.categories.map((entry) => entry.category),
      }));
    },
    completeAiChat: async (input) => {
      if (input.messages.some((message) => message.role === "tool")) {
        return { message: { role: "assistant", content: "Draft siap." } };
      }
      return {
        message: { role: "assistant", content: "" },
        toolCalls: [{
          id: "call-search",
          name: "search_destinations",
          arguments: { keywords: "Padang" },
        }],
      };
    },
  });

  const chatApp = new Hono();
  chatApp.onError(errorHandler);
  chatApp.route("/api/v1/chat", createChatApi(chatService));
  return chatApp;
}

afterAll(() => {
  if (PREV_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = PREV_NODE_ENV;
  for (const key of AI_ENV) {
    const value = PREV_AI[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("health and openapi docs return their documented shapes", async () => {
  const live = await app.request("/health/live");
  assert.equal(live.status, 200);
  expectShape(responseShapes.health, await live.json(), "health/live");

  const ready = await app.request("/health/ready");
  assert.ok(ready.status === 200 || ready.status === 503);
  const readyBody = (await ready.json()) as { status?: string; dependencies?: { database?: string }; requestId?: string };
  assert.equal(typeof readyBody.requestId, "string");
  if (ready.status === 200) {
    assert.equal(readyBody.status, "ok");
    assert.equal(readyBody.dependencies?.database, "ok");
  } else {
    assert.equal(readyBody.status, "not_ready");
  }

  const spec = await app.request("/openapi.json");
  assert.equal(spec.status, 200);
  const specBody = (await spec.json()) as { openapi?: string; paths?: Record<string, unknown> };
  assert.equal(specBody.openapi, "3.1.0");
  assert.ok(specBody.paths?.["/api/v1/users"]);
  assert.ok(specBody.paths?.["/api/v1/routes/driving"]);
  for (const path of [
    "/api/v1/chat/sessions/{id}",
    "/api/v1/chat/messages/{id}/regenerate",
    "/api/v1/chat/messages/{id}/versions",
    "/api/v1/chat/messages/{id}/versions/{version}/activate",
    "/api/v1/itineraries/by-session/{sessionId}",
    "/api/v1/itineraries/{id}/versions",
    "/api/v1/itineraries/{id}/versions/{version}",
    "/api/v1/itineraries/{id}/versions/{version}/select",
    "/api/v1/itineraries/{id}/versions/{version}/save",
    "/api/v1/itineraries/{id}/restore/{version}",
  ]) {
    assert.ok(specBody.paths?.[path], `missing OpenAPI path ${path}`);
  }
});

test("users API response shapes match the OpenAPI contract", async () => {
  const email = `openapi-${randomUUID()}@example.test`;
  let userId: string | undefined;

  try {
    const created = await app.request("/api/v1/users", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ name: "OpenAPI Shape", email }),
    });
    assert.equal(created.status, 201);
    const createdBody = expectShape(responseShapes.user, await created.json(), "users create");
    userId = createdBody.data.id;
    assert.equal(createdBody.data.email, email);

    const list = await app.request("/api/v1/users?limit=100");
    assert.equal(list.status, 200);
    const listBody = expectShape(responseShapes.userList, await list.json(), "users list");
    assert.ok(listBody.data.some((user) => user.id === userId));

    const detail = await app.request(`/api/v1/users/${userId}`);
    assert.equal(detail.status, 200);
    const detailBody = expectShape(responseShapes.user, await detail.json(), "users detail");
    assert.equal(detailBody.data.id, userId);

    const updated = await app.request(`/api/v1/users/${userId}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({ name: "OpenAPI Shape Updated" }),
    });
    assert.equal(updated.status, 200);
    expectShape(responseShapes.user, await updated.json(), "users update");

    const removed = await app.request(`/api/v1/users/${userId}`, { method: "DELETE" });
    assert.equal(removed.status, 200);
    const removedBody = expectShape(responseShapes.user, await removed.json(), "users delete");
    assert.equal(removedBody.data.isActive, false);
  } finally {
    if (userId) await cleanupUser(userId);
  }
});

test("users API error shapes match the OpenAPI contract", async () => {
  const invalid = await app.request("/api/v1/users", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ name: "", email: "invalid" }),
  });
  assert.equal(invalid.status, 400);
  expectShape(responseShapes.error, await invalid.json(), "validation error");

  const missing = await app.request("/api/v1/users/00000000-0000-4000-8000-000000000099");
  assert.equal(missing.status, 404);
  expectShape(responseShapes.error, await missing.json(), "not found error");
});

test("destinations API response shapes match the OpenAPI contract", async () => {
  const list = await app.request("/api/v1/destinations?city=Padang&limit=1");
  assert.equal(list.status, 200);
  const listBody = expectShape(responseShapes.destinationList, await list.json(), "destinations list");
  assert.ok(listBody.data.length >= 1);
  const first = listBody.data[0]!;

  const detail = await app.request(`/api/v1/destinations/${first.id}`);
  assert.equal(detail.status, 200);
  const detailBody = expectShape(responseShapes.destination, await detail.json(), "destinations detail");
  assert.equal(detailBody.data.id, first.id);

  const missing = await app.request("/api/v1/destinations/00000000-0000-4000-8000-000000000099");
  assert.equal(missing.status, 404);
  expectShape(responseShapes.error, await missing.json(), "destination 404");
});

test("chat and itinerary response shapes match the OpenAPI contract", async () => {
  process.env.NODE_ENV = "test";
  const rows = await prisma.destination.findMany({
    where: { city: "Padang", isActive: true, latitude: { not: null }, longitude: { not: null } },
    take: 2,
    select: { id: true, name: true, latitude: true, longitude: true },
    orderBy: { createdAt: "asc" },
  });
  assert.ok(rows.length >= 2, "need >=2 active Padang destinations (run seed)");

  const provider = createServer((_req, res) => {
    res.statusCode = 404;
    res.end("unused");
  });
  await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const address = provider.address();
  assert.ok(address && typeof address === "object");

  const chatApp = buildChatApp(`http://127.0.0.1:${address.port}/v1`);
  const email = `openapi-chat-${randomUUID()}@example.test`;
  let userId: string | undefined;
  try {
    const user = await prisma.user.create({ data: { name: "OpenAPI Chat", email }, select: { id: true } });
    userId = user.id;

    const sessionRes = await chatApp.request("/api/v1/chat/sessions", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ userId, title: "Shape Test" }),
    });
    assert.equal(sessionRes.status, 201);
    const sessionBody = expectShape(responseShapes.chatSession, await sessionRes.json(), "chat session create");

    const sessionsRes = await chatApp.request(`/api/v1/chat/sessions?userId=${userId}&page=1&limit=10`);
    assert.equal(sessionsRes.status, 200);
    expectShape(responseShapes.chatSessionList, await sessionsRes.json(), "chat session list");

    // general_chat path: exercises ChatReply shape (draft nullable) without needing a tool-produced draft.
    const sendRes = await chatApp.request(`/api/v1/chat/sessions/${sessionBody.data.id}/messages`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ userId, content: "Halo, apa kabar?" }),
    });
    assert.equal(sendRes.status, 200);
    const sendBody = expectShape(responseShapes.chatReply, await sendRes.json(), "chat send");
    assert.equal(sendBody.data.draft, null);

    const messagesRes = await chatApp.request(
      `/api/v1/chat/sessions/${sessionBody.data.id}/messages?userId=${userId}&page=1&limit=10`,
    );
    assert.equal(messagesRes.status, 200);
    const messagesBody = expectShape(responseShapes.chatMessageList, await messagesRes.json(), "chat messages list");
    assert.ok(messagesBody.data.length >= 2);

    // Itinerary confirm/get: use draft store (same as confirm flow) to validate response shapes.
    const draftStore = createDraftStore();
    const draft: ItineraryDraftResponse = {
      draftId: "pending",
      status: "pending_confirmation",
      travelDate: "2026-12-01",
      startTime: "08:00",
      endTime: "17:00",
      destinations: rows.map((row, index) => ({
        order: index + 1,
        destinationId: row.id,
        name: row.name,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        visitAt: index === 0 ? "08:00" : "09:30",
        durationMinutes: 60,
      })),
      route: {
        type: "LineString",
        coordinates: rows.map((row) => [Number(row.longitude), Number(row.latitude)] as [number, number]),
      },
    };
    const draftId = await draftStore.saveDraft({ userId, sessionId: sessionBody.data.id, itinerary: draft });

    const itineraryApp = new Hono();
    itineraryApp.onError(errorHandler);
    itineraryApp.route("/api/v1/itineraries", createItineraryApi(createItineraryService({
      getDraft: (input) => draftStore.getDraft(input),
      findUserById: (id) => prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } }),
    })));

    const confirmRes = await itineraryApp.request("/api/v1/itineraries/confirm", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ draftId, userId, sessionId: sessionBody.data.id }),
    });
    assert.equal(confirmRes.status, 201);
    const confirmBody = expectShape(responseShapes.itinerary, await confirmRes.json(), "itinerary confirm");
    assert.equal(confirmBody.data.sessionId, sessionBody.data.id);

    const detailRes = await itineraryApp.request(
      `/api/v1/itineraries/${confirmBody.data.id}?userId=${userId}`,
    );
    assert.equal(detailRes.status, 200);
    expectShape(responseShapes.itinerary, await detailRes.json(), "itinerary detail");
  } finally {
    await new Promise<void>((resolve, reject) => provider.close((err) => (err ? reject(err) : resolve())));
    if (userId) await cleanupUser(userId);
  }
});

test("new chat session, message version, and itinerary version endpoints match the OpenAPI contract", async () => {
  process.env.NODE_ENV = "test";
  const rows = await prisma.destination.findMany({
    where: { city: "Padang", isActive: true, latitude: { not: null }, longitude: { not: null } },
    take: 2,
    select: { id: true, name: true, latitude: true, longitude: true },
    orderBy: { createdAt: "asc" },
  });
  assert.ok(rows.length >= 2, "need >=2 active Padang destinations (run seed)");

  const provider = createServer((_req, res) => {
    res.statusCode = 404;
    res.end("unused");
  });
  await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const address = provider.address();
  assert.ok(address && typeof address === "object");
  const chatApp = buildChatApp(`http://127.0.0.1:${address.port}/v1`);

  const user = await prisma.user.create({
    data: { name: "OpenAPI Versions", email: `openapi-v-${randomUUID()}@example.test` },
    select: { id: true },
  });
  const userId = user.id;
  try {
    const sessionRes = await chatApp.request("/api/v1/chat/sessions", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ userId, title: "Shape Versions" }),
    });
    assert.equal(sessionRes.status, 201);
    const sessionBody = expectShape(responseShapes.chatSession, await sessionRes.json(), "session create");
    const sessionId = sessionBody.data.id;

    const getSessionRes = await chatApp.request(`/api/v1/chat/sessions/${sessionId}?userId=${userId}`);
    assert.equal(getSessionRes.status, 200);
    expectShape(responseShapes.chatSession, await getSessionRes.json(), "session get");

    const patchSessionRes = await chatApp.request(`/api/v1/chat/sessions/${sessionId}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({ userId, title: "Renamed", summary: "ringkas" }),
    });
    assert.equal(patchSessionRes.status, 200);
    const patched = expectShape(responseShapes.chatSession, await patchSessionRes.json(), "session patch");
    assert.equal(patched.data.title, "Renamed");

    const sendRes = await chatApp.request(`/api/v1/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ userId, content: "Halo" }),
    });
    assert.equal(sendRes.status, 200);
    const sendBody = expectShape(responseShapes.chatReply, await sendRes.json(), "send");
    const assistantId = sendBody.data.assistantMessageId;

    const keysetRes = await chatApp.request(
      `/api/v1/chat/sessions/${sessionId}/messages?userId=${userId}&after_position=0&limit=10`,
    );
    assert.equal(keysetRes.status, 200);
    const keysetBody = expectShape(responseShapes.chatMessageKeysetList, await keysetRes.json(), "messages keyset");
    assert.ok(keysetBody.data.length >= 2);
    assert.ok(keysetBody.data.every((message) => typeof message.activeVersion === "number"));

    const versionsRes = await chatApp.request(`/api/v1/chat/messages/${assistantId}/versions?userId=${userId}`);
    assert.equal(versionsRes.status, 200);
    const versionsBody = expectShape(responseShapes.chatVersionList, await versionsRes.json(), "message versions");
    assert.equal(versionsBody.data.activeVersion, 1);
    assert.equal(versionsBody.data.versions.length, 1);

    const regenRes = await chatApp.request(`/api/v1/chat/messages/${assistantId}/regenerate`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ userId }),
    });
    assert.equal(regenRes.status, 200);
    const regenBody = expectShape(responseShapes.chatRegenerate, await regenRes.json(), "message regenerate");
    assert.equal(regenBody.data.activeVersion, 2);

    const activateRes = await chatApp.request(
      `/api/v1/chat/messages/${assistantId}/versions/1/activate`,
      { method: "PATCH", headers: json, body: JSON.stringify({ userId }) },
    );
    assert.equal(activateRes.status, 200);
    const activateBody = expectShape(responseShapes.chatVersionActivation, await activateRes.json(), "message activate");
    assert.equal(activateBody.data.activeVersion, 1);

    const draftStore = createDraftStore();
    const draft: ItineraryDraftResponse = {
      draftId: "pending",
      status: "pending_confirmation",
      travelDate: "2026-12-01",
      startTime: "08:00",
      endTime: "17:00",
      destinations: rows.map((row, index) => ({
        order: index + 1,
        destinationId: row.id,
        name: row.name,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        visitAt: index === 0 ? "08:00" : "09:30",
        durationMinutes: 60,
      })),
      route: {
        type: "LineString",
        coordinates: rows.map((row) => [Number(row.longitude), Number(row.latitude)] as [number, number]),
      },
    };
    const draftId = await draftStore.saveDraft({ userId, sessionId, itinerary: draft });

    const itineraryApp = new Hono();
    itineraryApp.onError(errorHandler);
    itineraryApp.route("/api/v1/itineraries", createItineraryApi(createItineraryService({
      getDraft: (input) => draftStore.getDraft(input),
      findUserById: (id) => prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } }),
    })));

    const confirmRes = await itineraryApp.request("/api/v1/itineraries/confirm", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ draftId, userId, sessionId }),
    });
    assert.equal(confirmRes.status, 201);
    const confirmBody = expectShape(responseShapes.itinerary, await confirmRes.json(), "itinerary confirm");
    const itineraryId = confirmBody.data.id;

    const bySessionRes = await itineraryApp.request(
      `/api/v1/itineraries/by-session/${sessionId}?userId=${userId}`,
    );
    assert.equal(bySessionRes.status, 200);
    const bySessionBody = expectShape(responseShapes.itineraryDetail, await bySessionRes.json(), "itinerary by session");
    assert.equal(bySessionBody.data.version?.version, 1);
    assert.equal(bySessionBody.data.version?.stops.length, 2);

    const versionsListRes = await itineraryApp.request(
      `/api/v1/itineraries/${itineraryId}/versions?userId=${userId}`,
    );
    assert.equal(versionsListRes.status, 200);
    const versionsListBody = expectShape(
      responseShapes.itineraryVersionList,
      await versionsListRes.json(),
      "itinerary versions",
    );
    assert.deepEqual(versionsListBody.data.map((version) => version.version), [1]);
    assert.equal(typeof versionsListBody.data[0]!.isSaved, "boolean");
    assert.equal(typeof versionsListBody.data[0]!.isSelected, "boolean");

    const versionDetailRes = await itineraryApp.request(
      `/api/v1/itineraries/${itineraryId}/versions/1?userId=${userId}`,
    );
    assert.equal(versionDetailRes.status, 200);
    const versionDetailBody = expectShape(
      responseShapes.itineraryVersion,
      await versionDetailRes.json(),
      "itinerary version detail",
    );
    assert.equal(versionDetailBody.data.version, 1);
    assert.equal(versionDetailBody.data.routeJson.legs.length, 1);

    const restoreRes = await itineraryApp.request(
      `/api/v1/itineraries/${itineraryId}/restore/1`,
      { method: "POST", headers: json, body: JSON.stringify({ userId, expectedVersion: 1 }) },
    );
    assert.equal(restoreRes.status, 200);
    const restoreBody = expectShape(responseShapes.itineraryDetail, await restoreRes.json(), "itinerary restore");
    assert.equal(restoreBody.data.currentVersion, 2);
    assert.equal(restoreBody.data.version?.version, 2);

    const staleRestoreRes = await itineraryApp.request(
      `/api/v1/itineraries/${itineraryId}/restore/1`,
      { method: "POST", headers: json, body: JSON.stringify({ userId, expectedVersion: 1 }) },
    );
    assert.equal(staleRestoreRes.status, 409);
    expectShape(responseShapes.error, await staleRestoreRes.json(), "stale restore error");

    const deleteRes = await chatApp.request(`/api/v1/chat/sessions/${sessionId}?userId=${userId}`, {
      method: "DELETE",
    });
    assert.equal(deleteRes.status, 200);
    const deleteBody = expectShape(responseShapes.sessionDelete, await deleteRes.json(), "session delete");
    assert.equal(deleteBody.data.deleted, true);
  } finally {
    await new Promise<void>((resolve, reject) => provider.close((err) => (err ? reject(err) : resolve())));
    await cleanupUser(userId);
  }
});

test("routing API response and error shapes match the OpenAPI contract", async () => {  const fetchFn: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        routes: [{ distance: 1234, duration: 456, geometry: { coordinates: [[100.36, -0.95], [100.37, -0.94]] } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  const routingApp = new Hono();
  routingApp.onError(errorHandler);
  routingApp.route("/api/v1/routes", createRoutingApi(createRoutingService({
    osrmBaseUrl: "http://osrm.test",
    timeoutMs: 1000,
    fetchFn,
    cache: createRouteCache({ ttlMs: 60_000 }),
  })));

  const ok = await routingApp.request("/api/v1/routes/driving", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ points: [{ latitude: -0.95, longitude: 100.36 }, { latitude: -0.94, longitude: 100.37 }], profile: "car" }),
  });
  assert.equal(ok.status, 200);
  expectShape(responseShapes.routeResult, await ok.json(), "route result");

  const invalid = await routingApp.request("/api/v1/routes/driving", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ points: [{ latitude: -0.95, longitude: 100.36 }], profile: "car" }),
  });
  assert.equal(invalid.status, 400);
  expectShape(responseShapes.error, await invalid.json(), "route validation error");
});
