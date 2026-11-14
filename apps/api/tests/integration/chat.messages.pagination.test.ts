import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, test } from "vitest";
import { Hono } from "hono";
import { prisma } from "../../src/db/client.js";
import { errorHandler } from "../../src/shared/http/errors.js";
import { createChatApi, createChatService } from "../../src/modules/chat/index.js";
import {
  appendMessage,
  createSession,
  findOrCreateSystemModel,
} from "../../src/modules/chat/repositories/chat.repository.js";

const PREV_NODE_ENV = process.env.NODE_ENV;

function buildApp() {
  process.env.NODE_ENV = "test";
  const chatService = createChatService({
    findUserById: async (id) => {
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

async function createUser() {
  return prisma.user.create({
    data: { name: "Chat Pagination", username: `u-${randomUUID()}`, email: `chat-page-${randomUUID()}@example.test` },
    select: { id: true },
  });
}

const createdUserIds: string[] = [];

afterAll(async () => {
  if (PREV_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = PREV_NODE_ENV;
  for (const userId of createdUserIds) {
    await prisma.chatMessage.deleteMany({ where: { session: { userId } } });
    await prisma.chatSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
});

test("legacy page/limit still works with deterministic position order and compat meta", async () => {
  const app = buildApp();
  const user = await createUser();
  createdUserIds.push(user.id);
  const model = await findOrCreateSystemModel({ provider: "test", modelIdentifier: `page-${randomUUID()}`, name: "page-test" });
  const session = await createSession({ userId: user.id, modelId: model.id, title: "page" });

  await appendMessage({ sessionId: session.id, role: "user", content: "one", modelId: model.id });
  await appendMessage({ sessionId: session.id, role: "assistant", content: "two", modelId: model.id });
  await appendMessage({ sessionId: session.id, role: "user", content: "three", modelId: model.id });

  const res = await app.request(`/api/v1/chat/sessions/${session.id}/messages?userId=${user.id}&page=1&limit=2`);
  assert.equal(res.status, 200);
  const body = await res.json() as { data: Array<{ content: string; position?: number }>; meta: { page: number; limit: number; total: number } };
  assert.deepEqual(body.data.map((m) => m.content), ["one", "two"]);
  assert.equal(body.meta.page, 1);
  assert.equal(body.meta.limit, 2);
  assert.equal(body.meta.total, 3);
  assert.deepEqual(body.data.map((m) => m.position), [1, 2]);

  const res2 = await app.request(`/api/v1/chat/sessions/${session.id}/messages?userId=${user.id}&page=2&limit=2`);
  assert.equal(res2.status, 200);
  const body2 = await res2.json() as { data: Array<{ content: string; position?: number }>; meta: { page: number; limit: number; total: number } };
  assert.deepEqual(body2.data.map((m) => m.content), ["three"]);
  assert.deepEqual(body2.meta, { page: 2, limit: 2, total: 3 });
});

test("keyset pagination with after_position returns ordered page and additive meta", async () => {
  const app = buildApp();
  const user = await createUser();
  createdUserIds.push(user.id);
  const model = await findOrCreateSystemModel({ provider: "test", modelIdentifier: `keyset-${randomUUID()}`, name: "keyset-test" });
  const session = await createSession({ userId: user.id, modelId: model.id, title: "keyset" });

  await appendMessage({ sessionId: session.id, role: "user", content: "m1", modelId: model.id });
  await appendMessage({ sessionId: session.id, role: "assistant", content: "m2", modelId: model.id });
  await appendMessage({ sessionId: session.id, role: "user", content: "m3", modelId: model.id });
  await appendMessage({ sessionId: session.id, role: "assistant", content: "m4", modelId: model.id });

  const res = await app.request(`/api/v1/chat/sessions/${session.id}/messages?userId=${user.id}&after_position=1&limit=2`);
  assert.equal(res.status, 200);
  const body = await res.json() as { data: Array<{ content: string; position: number }>; meta: { limit: number; nextAfterPosition: number | null } };
  assert.deepEqual(body.data.map((m) => m.position), [2, 3]);
  assert.deepEqual(body.data.map((m) => m.content), ["m2", "m3"]);
  assert.equal(body.meta.limit, 2);
  assert.equal(body.meta.nextAfterPosition, 3);

  const res2 = await app.request(`/api/v1/chat/sessions/${session.id}/messages?userId=${user.id}&after_position=3&limit=2`);
  assert.equal(res2.status, 200);
  const body2 = await res2.json() as { data: Array<{ position: number }>; meta: { limit: number; nextAfterPosition: number | null } };
  assert.deepEqual(body2.data.map((m) => m.position), [4]);
  assert.equal(body2.meta.nextAfterPosition, null);
});

test("append assigns positions atomically and sequentially", async () => {
  const user = await createUser();
  createdUserIds.push(user.id);
  const model = await findOrCreateSystemModel({ provider: "test", modelIdentifier: `atomic-${randomUUID()}`, name: "atomic-test" });
  const session = await createSession({ userId: user.id, modelId: model.id, title: "atomic" });

  const a = await appendMessage({ sessionId: session.id, role: "user", content: "a", modelId: model.id });
  const b = await appendMessage({ sessionId: session.id, role: "assistant", content: "b", modelId: model.id });
  const c = await appendMessage({ sessionId: session.id, role: "user", content: "c", modelId: model.id });
  assert.deepEqual([a.position, b.position, c.position], [1, 2, 3]);
});
