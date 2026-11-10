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
  process.env.NODE_ENV = "test";
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
  const email = `chat-ver-${randomUUID()}@example.test`;
  return prisma.user.create({ data: { name: "Chat Version Test", email }, select: { id: true } });
}

async function cleanupUser(userId: string) {
  await prisma.chatMessage.deleteMany({ where: { session: { userId } } });
  await prisma.chatSession.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

async function startFakeProvider(handler: (body: unknown, call: number) => { status?: number; json: unknown }) {
  let calls = 0;
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      calls += 1;
      const body = raw ? (JSON.parse(raw) as unknown) : {};
      const out = handler(body, calls);
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

test("regenerate creates v2 on same assistant message and returns updated compat payload", async () => {
  const provider = await startFakeProvider(() =>
    toolCallResponse("search_destinations", { keywords: "pantai", categories: ["seed-pantai"] }),
  );
  const app = buildApp(provider.url);
  const user = await createTestUser();
  try {
    const created = await app.request("/api/v1/chat/sessions", { method: "POST", headers: json, body: JSON.stringify({ userId: user.id }) });
    const session = (await created.json() as { data: { id: string } }).data;
    const sent = await app.request(`/api/v1/chat/sessions/${session.id}/messages`, {
      method: "POST", headers: json,
      body: JSON.stringify({ userId: user.id, content: "buat itinerary 2026-12-01 08:00 17:00 pantai di Padang" }),
    });
    assert.equal(sent.status, 200);
    const first = await sent.json() as { data: { assistantMessageId: string; sessionId: string } };
    assert.ok(first.data.assistantMessageId);

    const regen = await app.request(`/api/v1/chat/messages/${first.data.assistantMessageId}/regenerate`, {
      method: "POST", headers: json, body: JSON.stringify({ userId: user.id }),
    });
    assert.equal(regen.status, 200, await regen.clone().text());
    const regenBody = await regen.json() as { data: Record<string, unknown> };
    const outId = (regenBody.data.assistantMessageId as string | undefined) ?? (regenBody.data.id as string | undefined);
    assert.equal(outId, first.data.assistantMessageId);
    assert.equal((regenBody.data.sessionId as string | undefined) ?? session.id, session.id);

    const versions = await app.request(`/api/v1/chat/messages/${first.data.assistantMessageId}/versions?userId=${user.id}`);
    assert.equal(versions.status, 200);
    const vbody = await versions.json() as { data: { activeVersion: number; versions?: Array<{ version: number }>; versionsJson?: Array<{ version: number }> } };
    const list = vbody.data.versions ?? vbody.data.versionsJson ?? [];
    assert.equal(vbody.data.activeVersion, 2);
    assert.equal(list.length, 2);
    assert.deepEqual(list.map((v) => v.version), [1, 2]);
  } finally {
    await provider.close();
    await cleanupUser(user.id);
  }
});

test("failed regenerate records failed version but keeps prior successful version active", async () => {
  const provider = await startFakeProvider((_body, call) => {
    if (call === 1) return toolCallResponse("search_destinations", { keywords: "pantai", categories: ["seed-pantai"] });
    return { status: 500, json: { error: "boom" } };
  });
  const app = buildApp(provider.url);
  const user = await createTestUser();
  try {
    const created = await app.request("/api/v1/chat/sessions", { method: "POST", headers: json, body: JSON.stringify({ userId: user.id }) });
    const session = (await created.json() as { data: { id: string } }).data;
    const sent = await app.request(`/api/v1/chat/sessions/${session.id}/messages`, {
      method: "POST", headers: json,
      body: JSON.stringify({ userId: user.id, content: "buat itinerary 2026-12-02 08:00 17:00 pantai di Padang" }),
    });
    assert.equal(sent.status, 200, await sent.clone().text());
    const first = await sent.json() as { data: { assistantMessageId: string } };
    const msgId = first.data.assistantMessageId;

    const before = await app.request(`/api/v1/chat/messages/${msgId}/versions?userId=${user.id}`);
    const beforeBody = await before.json() as { data: { activeVersion: number; versions?: Array<{ version: number; status: string; content: string }>; versionsJson?: Array<{ version: number; status: string; content: string }> } };
    const v1list = beforeBody.data.versions ?? beforeBody.data.versionsJson ?? [];
    assert.equal(beforeBody.data.activeVersion, 1);
    assert.equal(v1list[0]?.status, "completed");
    const v1Content = v1list[0]?.content;

    const regen = await app.request(`/api/v1/chat/messages/${msgId}/regenerate`, {
      method: "POST", headers: json, body: JSON.stringify({ userId: user.id }),
    });
    assert.ok(regen.status >= 400 || regen.status === 200);

    const after = await app.request(`/api/v1/chat/messages/${msgId}/versions?userId=${user.id}`);
    assert.equal(after.status, 200);
    const afterBody = await after.json() as { data: { activeVersion: number; versions?: Array<{ version: number; status: string; content?: string }>; versionsJson?: Array<{ version: number; status: string; content?: string }> } };
    const list = afterBody.data.versions ?? afterBody.data.versionsJson ?? [];
    assert.equal(list.length, 2);
    assert.deepEqual(list.map((v) => v.version), [1, 2]);
    assert.equal(list[0]?.status, "completed");
    assert.equal(list[1]?.status, "failed");
    assert.equal(afterBody.data.activeVersion, 1, "v1 must remain active after failed regenerate");
    const active = list.find((v) => v.version === 1);
    assert.equal(active?.content, v1Content);
  } finally {
    await provider.close();
    await cleanupUser(user.id);
  }
});

test("list versions and activate enforce ownership and preserve cumulative totals on switch", async () => {
  const provider = await startFakeProvider(() => toolCallResponse("search_destinations", { keywords: "pantai", categories: ["seed-pantai"] }));
  const app = buildApp(provider.url);
  const owner = await createTestUser();
  const other = await createTestUser();
  try {
    const created = await app.request("/api/v1/chat/sessions", { method: "POST", headers: json, body: JSON.stringify({ userId: owner.id }) });
    const session = (await created.json() as { data: { id: string } }).data;
    const sent = await app.request(`/api/v1/chat/sessions/${session.id}/messages`, {
      method: "POST", headers: json,
      body: JSON.stringify({ userId: owner.id, content: "buat itinerary 2026-12-03 08:00 17:00 pantai di Padang" }),
    });
    assert.equal(sent.status, 200);
    const first = await sent.json() as { data: { assistantMessageId: string } };
    const msgId = first.data.assistantMessageId;

    const regen = await app.request(`/api/v1/chat/messages/${msgId}/regenerate`, {
      method: "POST", headers: json, body: JSON.stringify({ userId: owner.id }),
    });
    assert.equal(regen.status, 200);

    const forbiddenList = await app.request(`/api/v1/chat/messages/${msgId}/versions?userId=${other.id}`);
    assert.equal(forbiddenList.status, 403);

    const okList = await app.request(`/api/v1/chat/messages/${msgId}/versions?userId=${owner.id}`);
    assert.equal(okList.status, 200);
    const listed = await okList.json() as { data: { activeVersion: number } };
    assert.equal(listed.data.activeVersion, 2);

    const sessBefore = await app.request(`/api/v1/chat/sessions/${session.id}?userId=${owner.id}`);
    const totalsBefore = (await sessBefore.json() as { data: { promptTokens: number; completionTokens: number; totalTokens: number } }).data;

    const forbiddenAct = await app.request(`/api/v1/chat/messages/${msgId}/versions/1/activate`, {
      method: "PATCH", headers: json, body: JSON.stringify({ userId: other.id }),
    });
    assert.equal(forbiddenAct.status, 403);

    const act = await app.request(`/api/v1/chat/messages/${msgId}/versions/1/activate`, {
      method: "PATCH", headers: json, body: JSON.stringify({ userId: owner.id }),
    });
    assert.equal(act.status, 200);

    const afterList = await app.request(`/api/v1/chat/messages/${msgId}/versions?userId=${owner.id}`);
    const afterListed = await afterList.json() as { data: { activeVersion: number } };
    assert.equal(afterListed.data.activeVersion, 1);

    const sessAfter = await app.request(`/api/v1/chat/sessions/${session.id}?userId=${owner.id}`);
    const totalsAfter = (await sessAfter.json() as { data: { promptTokens: number; completionTokens: number; totalTokens: number } }).data;
    assert.equal(totalsAfter.promptTokens, totalsBefore.promptTokens);
    assert.equal(totalsAfter.completionTokens, totalsBefore.completionTokens);
    assert.equal(totalsAfter.totalTokens, totalsBefore.totalTokens);
  } finally {
    await provider.close();
    await cleanupUser(other.id);
    await cleanupUser(owner.id);
  }
});
