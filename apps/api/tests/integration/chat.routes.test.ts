import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Hono } from "hono";
import { errorHandler } from "../../src/shared/http/errors.js";
import { createChatApi, createChatService } from "../../src/modules/chat/index.js";
import { prisma } from "../../src/db/client.js";

const json = { "content-type": "application/json" };
const PREV_NODE_ENV = process.env.NODE_ENV;

function buildApp(providerBaseUrl = "http://127.0.0.1:9/v1") {
  process.env.AI_BASE_URL = providerBaseUrl;
  process.env.AI_API_KEY = "test-key";
  process.env.AI_TOOL_MODEL = "test-tool-model";
  process.env.AI_TOOL_PROVIDER = "test";
  process.env.AI_TOOL_MAX_ROUNDS = "3";

  const chatService = createChatService({
    findUserById: async (id) => {
      if (id === "missing-user") return null;
      if (id === "inactive-user") return { id, isActive: false };
      const u = await prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } });
      return u ? { id: u.id, isActive: u.isActive } : null;
    },
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
          id: true, name: true, description: true, address: true, latitude: true, longitude: true, details: true, city: true, isActive: true,
          categories: { select: { category: { select: { slug: true } } } },
        },
      });
      return rows.map((r) => ({
        ...r,
        latitude: r.latitude == null ? null : Number(r.latitude),
        longitude: r.longitude == null ? null : Number(r.longitude),
        categories: r.categories.map((c) => c.category),
      }));
    },
    getDestinationDetails: async (input) => {
      const rows = await prisma.destination.findMany({
        where: { id: { in: input.destinationIds }, city: "Padang", isActive: true },
        select: {
          id: true, name: true, description: true, address: true, latitude: true, longitude: true, details: true, city: true, isActive: true,
          categories: { select: { category: { select: { slug: true } } } },
        },
      });
      return rows.map((r) => ({
        ...r,
        latitude: r.latitude == null ? null : Number(r.latitude),
        longitude: r.longitude == null ? null : Number(r.longitude),
        categories: r.categories.map((c) => c.category),
      }));
    },
  });

  const app = new Hono();
  app.onError(errorHandler);
  app.route("/api/v1/chat", createChatApi(chatService));
  return app;
}

async function createTestUser() {
  const email = `chat-${randomUUID()}@example.test`;
  return prisma.user.create({ data: { name: "Chat Test", email }, select: { id: true } });
}

async function cleanupUser(userId: string) {
  await prisma.chatMessage.deleteMany({ where: { session: { userId } } });
  await prisma.chatSession.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

async function startFakeProvider(handler: (body: unknown) => { status?: number; json: unknown }) {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? (JSON.parse(raw) as unknown) : {};
      const out = handler(body);
      res.statusCode = out.status ?? 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(out.json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return { url: `http://127.0.0.1:${port}/v1`, close: () => new Promise<void>((r) => server.close(() => r())) };
}

function toolCallResponse(name: string, args: Record<string, unknown>) {
  return { json: { choices: [{ message: { tool_calls: [{ id: "call_1", type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: "tool_calls" }] } };
}

afterAll(() => {
  if (PREV_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = PREV_NODE_ENV;
});

test("chat routes validate input and return 503 in production", async () => {
  process.env.NODE_ENV = "production";
  const app = buildApp();
  const res = await app.request("/api/v1/chat/sessions", { method: "POST", headers: json, body: JSON.stringify({ userId: "u" }) });
  assert.equal(res.status, 503);
  assert.equal((await res.json() as { error: { code: string } }).error.code, "AUTH_NOT_CONFIGURED");
  process.env.NODE_ENV = "test";
});

test("chat routes validate input and enforce ownership/auth", async () => {
  process.env.NODE_ENV = "test";
  const app = buildApp();
  const owner = await createTestUser();
  const other = await createTestUser();
  try {
    const bad = await app.request("/api/v1/chat/sessions", { method: "POST", headers: json, body: JSON.stringify({}) });
    assert.equal(bad.status, 400);

    const missing = await app.request("/api/v1/chat/sessions", { method: "POST", headers: json, body: JSON.stringify({ userId: "missing-user" }) });
    assert.equal(missing.status, 401);
    assert.equal((await missing.json() as { error: { code: string } }).error.code, "AUTH_REQUIRED");

    const inactive = await app.request("/api/v1/chat/sessions", { method: "POST", headers: json, body: JSON.stringify({ userId: "inactive-user" }) });
    assert.equal(inactive.status, 401);

    const created = await app.request("/api/v1/chat/sessions", { method: "POST", headers: json, body: JSON.stringify({ userId: owner.id, title: "Trip" }) });
    assert.equal(created.status, 201);
    const session = (await created.json() as { data: { id: string } }).data;

    const forbidden = await app.request(`/api/v1/chat/sessions/${session.id}/messages?userId=${other.id}`);
    assert.equal(forbidden.status, 403);

    const ownList = await app.request(`/api/v1/chat/sessions/${session.id}/messages?userId=${owner.id}`);
    assert.equal(ownList.status, 200);
  } finally {
    await cleanupUser(other.id);
    await cleanupUser(owner.id);
  }
});

test("greeting returns general_chat without provider answer call and persists history", async () => {
  process.env.NODE_ENV = "test";
  const provider = await startFakeProvider(() => ({ status: 500, json: { error: "must not be called" } }));
  const app = buildApp(provider.url);
  const user = await createTestUser();
  try {
    const created = await app.request("/api/v1/chat/sessions", { method: "POST", headers: json, body: JSON.stringify({ userId: user.id }) });
    const session = (await created.json() as { data: { id: string } }).data;
    const sent = await app.request(`/api/v1/chat/sessions/${session.id}/messages`, { method: "POST", headers: json, body: JSON.stringify({ userId: user.id, content: "halo" }) });
    assert.equal(sent.status, 200);
    const body = await sent.json() as { data: { intent: string; draft: unknown; message: string } };
    assert.equal(body.data.intent, "general_chat");
    assert.equal(body.data.draft, null);
    assert.ok(body.data.message.length > 0);

    const history = await app.request(`/api/v1/chat/sessions/${session.id}/messages?userId=${user.id}&limit=20`);
    const historyBody = await history.json() as { data: Array<{ role: string; content: string; position?: number }>; meta: { page?: number; limit: number; total?: number } };
    const rows = historyBody.data;
    assert.deepEqual(rows.map((r) => r.role), ["user", "assistant"]);
    assert.equal(rows[0]?.content, "halo");
    assert.equal(historyBody.meta.page, 1);
    assert.equal(historyBody.meta.limit, 20);
    assert.equal(historyBody.meta.total, 2);
    assert.deepEqual(rows.map((r) => r.position), [1, 2]);
  } finally {
    await provider.close();
    await cleanupUser(user.id);
  }
});

test("missing date/time/categories asks clarification with no tool run", async () => {
  process.env.NODE_ENV = "test";
  const provider = await startFakeProvider(() => ({ status: 500, json: { error: "must not be called" } }));
  const app = buildApp(provider.url);
  const user = await createTestUser();
  try {
    const created = await app.request("/api/v1/chat/sessions", { method: "POST", headers: json, body: JSON.stringify({ userId: user.id }) });
    const session = (await created.json() as { data: { id: string } }).data;
    const sent = await app.request(`/api/v1/chat/sessions/${session.id}/messages`, { method: "POST", headers: json, body: JSON.stringify({ userId: user.id, content: "buat itinerary di padang" }) });
    assert.equal(sent.status, 200);
    const body = await sent.json() as { data: { intent: string; draft: unknown } };
    assert.equal(body.data.intent, "missing_information");
    assert.equal(body.data.draft, null);
  } finally {
    await provider.close();
    await cleanupUser(user.id);
  }
});

test("itinerary request performs tool call, returns draft, and does not save itinerary row before confirm", async () => {
  process.env.NODE_ENV = "test";
  let toolCallsSeen = 0;
  const provider = await startFakeProvider((body) => {
    toolCallsSeen++;
    const b = body as { tools?: unknown[] };
    assert.ok(Array.isArray(b.tools) && b.tools.length > 0);
    return toolCallResponse("search_destinations", { keywords: "pantai", categories: ["seed-pantai"] });
  });
  const app = buildApp(provider.url);
  const user = await createTestUser();
  try {
    const created = await app.request("/api/v1/chat/sessions", { method: "POST", headers: json, body: JSON.stringify({ userId: user.id }) });
    const session = (await created.json() as { data: { id: string } }).data;
    const sent = await app.request(`/api/v1/chat/sessions/${session.id}/messages`, {
      method: "POST", headers: json,
      body: JSON.stringify({ userId: user.id, content: "buat itinerary 2026-12-01 08:00 17:00 pantai di Padang" }),
    });
    const body = await sent.json() as { data?: { intent: string; draft: { draftId: string; destinations: Array<{ destinationId: string; latitude: number; longitude: number; order: number; visitAt: string }>; route: { type: string; coordinates: unknown[] } | null } | null }; error?: unknown };
    assert.equal(sent.status, 200, JSON.stringify(body));

    assert.equal(body.data.intent, "generate_itinerary");
    assert.ok(toolCallsSeen >= 1);
    assert.ok(body.data.draft);
    assert.ok(body.data.draft.destinations.length >= 1);
    assert.ok(typeof body.data.draft.draftId === "string" && body.data.draft.draftId.length > 0);
    for (const d of body.data.draft.destinations) {
      assert.equal(typeof d.destinationId, "string");
      assert.equal(typeof d.latitude, "number");
      assert.equal(typeof d.longitude, "number");
      assert.ok(d.order >= 1);
      assert.match(d.visitAt, /^\d{2}:\d{2}$/);
    }
    if (body.data.draft.route) assert.equal(body.data.draft.route.type, "LineString");

    const itineraryCount = await prisma.itinerary.count({ where: { sessionId: session.id } });
    assert.equal(itineraryCount, 0);
  } finally {
    await provider.close();
    await cleanupUser(user.id);
  }
});

test("provider/model/tool errors map to controlled envelopes", async () => {
  process.env.NODE_ENV = "test";
  const user = await createTestUser();
  try {
    const noTool = await startFakeProvider(() => ({ json: { choices: [{ message: { content: "ok" }, finish_reason: "stop" }] } }));
    let app = buildApp(noTool.url);
    let created = await app.request("/api/v1/chat/sessions", { method: "POST", headers: json, body: JSON.stringify({ userId: user.id }) });
    let session = (await created.json() as { data: { id: string } }).data;
    let sent = await app.request(`/api/v1/chat/sessions/${session.id}/messages`, { method: "POST", headers: json, body: JSON.stringify({ userId: user.id, content: "buat itinerary 2026-12-02 08:00 17:00 pantai" }) });
    assert.equal(sent.status, 422);
    assert.equal((await sent.json() as { error: { code: string } }).error.code, "TOOL_CALL_REQUIRED");
    await noTool.close();

    const malformed = await startFakeProvider(() => ({ json: { choices: [{ message: { tool_calls: [{ id: "c1", type: "function", function: { name: "search_destinations", arguments: "{bad" } }] }, finish_reason: "tool_calls" }] } }));
    app = buildApp(malformed.url);
    created = await app.request("/api/v1/chat/sessions", { method: "POST", headers: json, body: JSON.stringify({ userId: user.id }) });
    session = (await created.json() as { data: { id: string } }).data;
    sent = await app.request(`/api/v1/chat/sessions/${session.id}/messages`, { method: "POST", headers: json, body: JSON.stringify({ userId: user.id, content: "buat itinerary 2026-12-03 08:00 17:00 pantai" }) });
    assert.equal(sent.status, 502);
    await malformed.close();

    const upstream = await startFakeProvider(() => ({ status: 500, json: { error: "boom" } }));
    app = buildApp(upstream.url);
    created = await app.request("/api/v1/chat/sessions", { method: "POST", headers: json, body: JSON.stringify({ userId: user.id }) });
    session = (await created.json() as { data: { id: string } }).data;
    sent = await app.request(`/api/v1/chat/sessions/${session.id}/messages`, { method: "POST", headers: json, body: JSON.stringify({ userId: user.id, content: "buat itinerary 2026-12-04 08:00 17:00 pantai" }) });
    assert.ok([429, 502].includes(sent.status));
    assert.equal((await sent.json() as { error: { code: string } }).error.code, "AI_UPSTREAM_ERROR");
    await upstream.close();
  } finally {
    await cleanupUser(user.id);
  }
});
