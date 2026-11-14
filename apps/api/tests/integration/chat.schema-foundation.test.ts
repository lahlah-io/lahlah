import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, test } from "vitest";
import { prisma } from "../../src/db/client.js";

async function createUser() {
  return prisma.user.create({
    data: { name: "Chat Schema", username: `u-${randomUUID()}`, email: `chat-schema-${randomUUID()}@example.test` },
    select: { id: true },
  });
}

async function getOrCreateModel() {
  const existing = await prisma.model.findFirst({ select: { id: true } });
  if (existing) return existing;
  return prisma.model.create({
    data: { name: "schema-test", provider: "test", modelIdentifier: `schema-${randomUUID()}` },
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

test("chat schema foundation: tool role, sequential positions, unique constraint, version fields", async () => {
  const user = await createUser();
  createdUserIds.push(user.id);
  const model = await getOrCreateModel();

  const session = await prisma.chatSession.create({
    data: {
      userId: user.id,
      modelId: model.id,
      title: "Schema foundation",
      status: "active",
      schemaVersion: 1,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    } as any,
    select: { id: true },
  });

  const cm: any = prisma.chatMessage;

  const m1 = await cm.create({
    data: {
      sessionId: session.id,
      modelId: model.id,
      role: "tool",
      content: "tool result",
      position: 1,
      inputTokens: 0,
      outputTokens: 0,
      status: "completed",
      activeVersion: 1,
      schemaVersion: 1,
      versionsJson: [
        {
          version: 1,
          content: "tool result",
          inputTokens: 0,
          outputTokens: 0,
          metadata: {},
        },
      ],
      metadata: {},
    },
    select: { id: true, role: true, position: true, activeVersion: true, versionsJson: true, status: true },
  });

  assert.equal(m1.role, "tool");
  assert.equal(m1.position, 1);
  assert.equal(m1.activeVersion, 1);
  assert.equal(m1.status, "completed");
  assert.ok(Array.isArray(m1.versionsJson) && m1.versionsJson.length >= 1);

  const m2 = await cm.create({
    data: {
      sessionId: session.id,
      modelId: model.id,
      role: "assistant",
      content: "answer",
      position: 2,
      inputTokens: 0,
      outputTokens: 0,
      metadata: {},
    },
    select: { id: true, position: true },
  });
  assert.equal(m2.position, 2);

  const listed = await cm.findMany({
    where: { sessionId: session.id },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });
  assert.deepEqual(listed.map((r: any) => r.position), [1, 2]);

  await assert.rejects(
    () =>
      cm.create({
        data: {
          sessionId: session.id,
          modelId: model.id,
          role: "user",
          content: "dup",
          position: 1,
          inputTokens: 0,
          outputTokens: 0,
          metadata: {},
        },
      }),
    (err: any) => err?.code === "P2002",
  );
});
