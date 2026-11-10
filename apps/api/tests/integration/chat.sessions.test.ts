import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { errorHandler } from "../../src/shared/http/errors.js";
import { createChatApi, createChatService } from "../../src/modules/chat/index.js";
import * as chatRepository from "../../src/modules/chat/repositories/chat.repository.js";
import { prisma } from "../../src/db/client.js";

const json = { "content-type": "application/json" };
const PREV_NODE_ENV = process.env.NODE_ENV;

function buildApp() {
  process.env.AI_TOOL_MODEL = "test-tool-model";
  process.env.AI_TOOL_PROVIDER = "test";

  const chatService = createChatService({
    findUserById: async (id) => {
      if (id === "missing-user") return null;
      if (id === "inactive-user") return { id, isActive: false };
      const u = await prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } });
      return u ? { id: u.id, isActive: u.isActive } : null;
    },
    searchDestinations: async () => [],
    getDestinationDetails: async () => [],
  });

  const app = new Hono();
  app.onError(errorHandler);
  app.route("/api/v1/chat", createChatApi(chatService));
  return app;
}

async function createTestUser() {
  const email = `chat-sess-${randomUUID()}@example.test`;
  return prisma.user.create({ data: { name: "Chat Session Test", email }, select: { id: true } });
}

async function cleanupUser(userId: string) {
  await prisma.chatMessage.deleteMany({ where: { session: { userId } } });
  await prisma.chatSession.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

afterAll(() => {
  if (PREV_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = PREV_NODE_ENV;
});

test("create/list sessions keep contract and include additive fields; list defaults pagination", async () => {
  process.env.NODE_ENV = "test";
  const app = buildApp();
  const user = await createTestUser();
  try {
    const created = await app.request("/api/v1/chat/sessions", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ userId: user.id, title: "Trip" }),
    });
    assert.equal(created.status, 201);
    const s = (await created.json() as { data: Record<string, unknown> }).data;
    assert.equal(typeof s.id, "string");
    assert.equal(s.userId, user.id);
    assert.equal(typeof s.modelId, "string");
    assert.equal(s.title, "Trip");
    assert.ok(typeof s.createdAt === "string");
    assert.ok(typeof s.updatedAt === "string");
    // additive
    assert.equal(s.status, "active");
    assert.equal(s.summary, null);
    assert.deepEqual(s.contextJson, {});
    assert.deepEqual(s.metadata, {});
    assert.equal(s.promptTokens, 0);
    assert.equal(s.completionTokens, 0);
    assert.equal(s.totalTokens, 0);
    assert.equal(s.lastMessageAt, null);
    assert.equal(s.schemaVersion, 1);

    const listed = await app.request(`/api/v1/chat/sessions?userId=${user.id}`);
    assert.equal(listed.status, 200);
    const body = await listed.json() as { data: Array<Record<string, unknown>>; meta: { page: number; limit: number; total: number } };
    assert.equal(body.meta.page, 1);
    assert.equal(body.meta.limit, 20);
    assert.equal(body.meta.total, 1);
    assert.equal(body.data[0]?.id, s.id);
    assert.equal(body.data[0]?.status, "active");
    assert.equal(body.data[0]?.promptTokens, 0);
  } finally {
    await cleanupUser(user.id);
  }
});

test("GET/PATCH/DELETE session by id with ownership checks", async () => {
  process.env.NODE_ENV = "test";
  const app = buildApp();
  const owner = await createTestUser();
  const other = await createTestUser();
  try {
    const created = await app.request("/api/v1/chat/sessions", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ userId: owner.id, title: "Old" }),
    });
    const session = (await created.json() as { data: { id: string } }).data;

    const got = await app.request(`/api/v1/chat/sessions/${session.id}?userId=${owner.id}`);
    assert.equal(got.status, 200);
    assert.equal((await got.json() as { data: { id: string; title: string } }).data.title, "Old");

    const gotForbidden = await app.request(`/api/v1/chat/sessions/${session.id}?userId=${other.id}`);
    assert.equal(gotForbidden.status, 403);

    const renamed = await app.request(`/api/v1/chat/sessions/${session.id}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({ userId: owner.id, title: "Renamed" }),
    });
    assert.equal(renamed.status, 200);
    const renamedBody = await renamed.json() as { data: { title: string; status: string } };
    assert.equal(renamedBody.data.title, "Renamed");
    assert.equal(renamedBody.data.status, "active");

    const patchForbidden = await app.request(`/api/v1/chat/sessions/${session.id}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({ userId: other.id, title: "Nope" }),
    });
    assert.equal(patchForbidden.status, 403);

    const delForbidden = await app.request(`/api/v1/chat/sessions/${session.id}?userId=${other.id}`, { method: "DELETE" });
    assert.equal(delForbidden.status, 403);

    const del = await app.request(`/api/v1/chat/sessions/${session.id}?userId=${owner.id}`, { method: "DELETE" });
    assert.ok(del.status === 200 || del.status === 204);

    const missing = await app.request(`/api/v1/chat/sessions/${session.id}?userId=${owner.id}`);
    assert.equal(missing.status, 404);
  } finally {
    await cleanupUser(other.id);
    await cleanupUser(owner.id);
  }
});

test("message writes update lastMessageAt and accumulate session token totals", async () => {
  process.env.NODE_ENV = "test";
  const app = buildApp();
  const user = await createTestUser();
  try {
    const created = await app.request("/api/v1/chat/sessions", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ userId: user.id }),
    });
    const session = (await created.json() as { data: { id: string } }).data;

    // sendMessage writes user + assistant; totals may be 0 but lastMessageAt must be set
    const sent = await app.request(`/api/v1/chat/sessions/${session.id}/messages`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ userId: user.id, content: "halo" }),
    });
    assert.equal(sent.status, 200);
    const afterSend = await app.request(`/api/v1/chat/sessions/${session.id}?userId=${user.id}`);
    const s1 = (await afterSend.json() as { data: { lastMessageAt: string | null; promptTokens: number; completionTokens: number; totalTokens: number } }).data;
    assert.equal(typeof s1.lastMessageAt, "string");
    assert.equal(s1.totalTokens, s1.promptTokens + s1.completionTokens);

    // explicit token accumulation on append
    const m = await chatRepository.appendMessage({
      sessionId: session.id,
      role: "assistant",
      content: "counted",
      inputTokens: 7,
      outputTokens: 3,
      metadata: {},
    });
    assert.ok(m.id);
    const afterAppend = await app.request(`/api/v1/chat/sessions/${session.id}?userId=${user.id}`);
    const s2 = (await afterAppend.json() as { data: { lastMessageAt: string | null; promptTokens: number; completionTokens: number; totalTokens: number } }).data;
    assert.equal(typeof s2.lastMessageAt, "string");
    assert.equal(s2.promptTokens, s1.promptTokens + 7);
    assert.equal(s2.completionTokens, s1.completionTokens + 3);
    assert.equal(s2.totalTokens, s2.promptTokens + s2.completionTokens);
    assert.ok(new Date(s2.lastMessageAt!).getTime() >= new Date(s1.lastMessageAt!).getTime());
  } finally {
    await cleanupUser(user.id);
  }
});
