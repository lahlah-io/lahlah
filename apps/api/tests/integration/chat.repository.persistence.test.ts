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
import {
  deleteActiveDraft,
  getActiveDraft,
  upsertActiveDraft,
} from "../../src/modules/chat/repositories/chat-draft.repository.js";

async function createUser() {
  return prisma.user.create({
    data: { name: "Chat Repo", email: `chat-repo-${randomUUID()}@example.test` },
    select: { id: true },
  });
}

const createdUserIds: string[] = [];

afterAll(async () => {
  for (const userId of createdUserIds) {
    await prisma.itineraryDraft.deleteMany({ where: { userId } });
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

test("chat draft repository: upsert, ownership/draftId enforcement, delete", async () => {
  const user = await createUser();
  const other = await createUser();
  createdUserIds.push(user.id, other.id);
  const model = await findOrCreateSystemModel({
    provider: "test",
    modelIdentifier: `draft-${randomUUID()}`,
    name: "draft-test",
  });
  const session = await createSession({ userId: user.id, modelId: model.id, title: "draft" });
  const otherSession = await createSession({ userId: other.id, modelId: model.id, title: "draft-other" });

  const first = await upsertActiveDraft({ sessionId: session.id, userId: user.id, payload: { v: 1 } });
  assert.equal(typeof first.draftId, "string");
  assert.deepEqual(first.payload, { v: 1 });

  const got = await getActiveDraft({ sessionId: session.id, userId: user.id });
  assert.ok(got);
  assert.equal(got!.draftId, first.draftId);
  assert.deepEqual(got!.payload, { v: 1 });

  const byId = await getActiveDraft({ sessionId: session.id, userId: user.id, draftId: first.draftId });
  assert.equal(byId?.draftId, first.draftId);

  const wrongId = await getActiveDraft({ sessionId: session.id, userId: user.id, draftId: randomUUID() });
  assert.equal(wrongId, null);

  const wrongUser = await getActiveDraft({ sessionId: session.id, userId: other.id });
  assert.equal(wrongUser, null);

  const wrongSessionOwner = await getActiveDraft({ sessionId: otherSession.id, userId: user.id });
  assert.equal(wrongSessionOwner, null);

  const replaced = await upsertActiveDraft({ sessionId: session.id, userId: user.id, payload: { v: 2 } });
  assert.equal(replaced.draftId, first.draftId);
  assert.deepEqual(replaced.payload, { v: 2 });
  const afterReplace = await getActiveDraft({ sessionId: session.id, userId: user.id });
  assert.deepEqual(afterReplace?.payload, { v: 2 });

  await deleteActiveDraft(session.id);
  const afterDelete = await getActiveDraft({ sessionId: session.id, userId: user.id });
  assert.equal(afterDelete, null);
});
