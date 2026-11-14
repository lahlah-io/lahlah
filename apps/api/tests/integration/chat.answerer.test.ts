import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, test } from "vitest";
import { prisma } from "../../src/db/client.js";
import { createChatService } from "../../src/modules/chat/index.js";
import { createItineraryService } from "../../src/modules/itinerary/index.js";
import * as usersRepository from "../../src/modules/users/repositories/users.repository.js";

const PREV_NODE_ENV = process.env.NODE_ENV;
const createdUserIds: string[] = [];

async function cleanupUser(userId: string) {
  await prisma.tripStop.deleteMany({ where: { version: { trip: { members: { some: { userId } } } } } });
  await prisma.tripVersion.deleteMany({ where: { trip: { members: { some: { userId } } } } });
  await prisma.destinationCheckpoint.deleteMany({ where: { tripDestination: { trip: { members: { some: { userId } } } } } });
  await prisma.tripDestination.deleteMany({ where: { trip: { members: { some: { userId } } } } });
  await prisma.trip.deleteMany({ where: { members: { some: { userId } } } });
  await prisma.chatMessage.deleteMany({ where: { session: { userId } } });
  await prisma.chatSession.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

beforeAll(() => {
  process.env.NODE_ENV = "test";
});

afterAll(async () => {
  for (const userId of createdUserIds) await cleanupUser(userId);
  if (PREV_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = PREV_NODE_ENV;
});

async function makeUser() {
  const user = await prisma.user.create({
    data: { name: "Answerer", username: `u-${randomUUID()}`, email: `answerer-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "answerer-fixture" } },
    update: {},
    create: { provider: "test", modelIdentifier: "answerer-fixture", name: "answerer-fixture", isActive: true },
    select: { id: true },
  });
  return { user, model };
}

test("general_chat stores the generated natural reply", async () => {
  const { user, model } = await makeUser();
  const findUserById = async (id: string) =>
    usersRepository.findUserById(id).then((u) => (u ? { id: u.id, isActive: u.isActive } : null));

  const chat = createChatService({
    findUserById,
    itinerary: createItineraryService({ findUserById }),
    retrieveRagContext: async () => '[{"name":"Pantai Air Manis","text":"pantai"}]',
    classifyMessage: async () => ({ intent: "general_chat", source: "rule" as const }),
    completeAiChat: async () => ({
      content: "Saya bisa bantu susun itinerary Padang.",
      toolCalls: [],
      finishReason: "stop",
      usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
    }),
    searchDestinations: async () => [],
    getDestinationDetails: async () => [],
  });

  const session = await chat.createSession({ userId: user.id, title: "answerer" });
  const result = await chat.sendMessage({ userId: user.id, sessionId: session.data.id, content: "halo" });

  assert.equal(result.data.intent, "general_chat");
  assert.equal(result.data.message, "Saya bisa bantu susun itinerary Padang.");
  assert.equal(result.data.version, null);
});
