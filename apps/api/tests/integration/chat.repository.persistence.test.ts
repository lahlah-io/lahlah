import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, test } from "vitest";
import { prisma } from "../../src/db/client.js";
import {
  appendMessage,
  createSession,
  findOrCreateSystemModel,
  listMessagesKeyset,
} from "../../src/modules/chat/repositories/chat.repository.js";

async function createUser() {
  return prisma.user.create({
    data: { name: "Chat Repo", username: `u-${randomUUID()}`, email: `chat-repo-${randomUUID()}@example.test` },
    select: { id: true },
  });
}

const createdUserIds: string[] = [];

afterAll(async () => {
  for (const userId of createdUserIds) {
    await prisma.chatMessage.deleteMany({ where: { session: { userId } } });
    await prisma.chatSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
});

test("chat repository: sequential appends yield contiguous positions and keyset pagination", async () => {
  const user = await createUser();
  createdUserIds.push(user.id);
  const model = await findOrCreateSystemModel({
    provider: "test",
    modelIdentifier: `repo-${randomUUID()}`,
    name: "repo-test",
  });
  const session = await createSession({ userId: user.id, modelId: model.id, title: "repo" });

  const m1 = await appendMessage({ sessionId: session.id, role: "user", content: "one", modelId: model.id });
  const m2 = await appendMessage({ sessionId: session.id, role: "assistant", content: "two", modelId: model.id });
  const m3 = await appendMessage({ sessionId: session.id, role: "tool", content: "three", modelId: model.id });

  assert.equal(m1.position, 1);
  assert.equal(m2.position, 2);
  assert.equal(m3.position, 3);

  const page1 = await listMessagesKeyset({ sessionId: session.id, limit: 2 });
  assert.equal(page1.meta.limit, 2);
  assert.deepEqual(page1.data.map((m) => m.position), [1, 2]);
  assert.equal(page1.meta.nextAfterPosition, 2);

  const page2 = await listMessagesKeyset({ sessionId: session.id, afterPosition: page1.meta.nextAfterPosition!, limit: 2 });
  assert.deepEqual(page2.data.map((m) => m.position), [3]);
  assert.equal(page2.meta.nextAfterPosition, null);

  const afterAll = await listMessagesKeyset({ sessionId: session.id, afterPosition: 3, limit: 5 });
  assert.deepEqual(afterAll.data, []);
  assert.equal(afterAll.meta.nextAfterPosition, null);
});
