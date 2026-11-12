import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, test } from "vitest";
import { prisma } from "../../src/db/client.js";
import { createChatService } from "../../src/modules/chat/index.js";
import { createItineraryService } from "../../src/modules/itinerary/index.js";
import * as usersRepository from "../../src/modules/users/repositories/users.repository.js";

const PREV_NODE_ENV = process.env.NODE_ENV;
const createdUserIds: string[] = [];

type Row = { id: string; name: string; latitude: number; longitude: number; category: string };

async function padangRows(min: number): Promise<Row[]> {
  const rows = await prisma.destination.findMany({
    where: { city: "Padang", isActive: true, latitude: { not: null }, longitude: { not: null } },
    take: min,
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, latitude: true, longitude: true, categories: { select: { category: { select: { slug: true } } } } },
  });
  assert.ok(rows.length >= min, "need >=min active Padang destinations (run seed)");
  return rows.map((r, i) => ({
    id: r.id,
    name: r.name,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    category: r.categories[0]?.category.slug ?? `cat-${i}`,
  }));
}

async function cleanupUser(userId: string) {
  await prisma.itineraryStop.deleteMany({ where: { version: { itinerary: { userId } } } });
  await prisma.itineraryVersion.deleteMany({ where: { itinerary: { userId } } });
  await prisma.destinationCheckpoint.deleteMany({ where: { itineraryDestination: { itinerary: { userId } } } });
  await prisma.itineraryDestination.deleteMany({ where: { itinerary: { userId } } });
  await prisma.itinerary.deleteMany({ where: { userId } });
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

test("generate keeps every tool result instead of the last one", async () => {
  const rows = await padangRows(8);
  const user = await prisma.user.create({
    data: { name: "Tool Flow", email: `toolflow-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);

  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "tool-flow-fixture" } },
    update: {},
    create: { provider: "test", modelIdentifier: "tool-flow-fixture", name: "tool-flow-fixture", isActive: true },
    select: { id: true },
  });
  const session = await prisma.chatSession.create({ data: { userId: user.id, modelId: model.id, title: "tool-flow" }, select: { id: true } });

  const findUserById = async (id: string) =>
    usersRepository.findUserById(id).then((u) => (u ? { id: u.id, isActive: u.isActive } : null));

  const itinerary = createItineraryService({
    getDraft: () => { throw new Error("draft store should not be used by the version flow"); },
    findUserById,
  });

  const chat = createChatService({
    itinerary,
    findUserById,
    classifyMessage: async () => ({ intent: "generate_itinerary", source: "rule" as const }),
    // One round, two tool calls. The second returns a single row: the regression case.
    completeAiChat: async () => ({
      content: null,
      finishReason: "tool_calls",
      toolCalls: [
        { id: "call-1", name: "search_destinations", arguments: { categories: ["pantai"] } },
        { id: "call-2", name: "get_destination_details", arguments: { destinationIds: [rows[0]!.id] } },
      ],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    }),
    searchDestinations: async () => rows.map((r) => ({ ...r, city: "Padang", isActive: true, details: {}, categories: [{ slug: r.category }] })),
    getDestinationDetails: async ({ destinationIds }) =>
      rows.filter((r) => destinationIds.includes(r.id)).map((r) => ({ ...r, city: "Padang", isActive: true, details: {}, categories: [{ slug: r.category }] })),
  });

  const res = await chat.sendMessage({ userId: user.id, sessionId: session.id, content: "buat itinerary pantai jam 08:00-16:00" });
  const data = res.data as { version: { stops: unknown[] }; map: { points: unknown[] } };

  assert.equal(data.version.stops.length, 8, "version keeps the union of both tool results");
  assert.equal(data.map.points.length, 8, "map mirrors the same destination count");
});