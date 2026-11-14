import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { prisma } from "../../src/db/client.js";
import { errorHandler } from "../../src/shared/http/errors.js";
import { createChatApi, createChatService } from "../../src/modules/chat/index.js";
import { createItineraryService } from "../../src/modules/itinerary/index.js";

const json = { "content-type": "application/json" };
const createdUserIds: string[] = [];

async function padangRows(min: number) {
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

afterAll(async () => {
  for (const userId of createdUserIds) {
    await prisma.destinationCheckpoint.deleteMany({ where: { tripDestination: { trip: { members: { some: { userId } } } } } });
    await prisma.tripDestination.deleteMany({ where: { trip: { members: { some: { userId } } } } });
    await prisma.trip.deleteMany({ where: { members: { some: { userId } } } });
    await prisma.chatMessage.deleteMany({ where: { session: { userId } } });
    await prisma.chatSession.deleteMany({ where: { userId } });
    const userTrips = await prisma.userTrip.findMany({ where: { userId }, select: { tripId: true } });
    for (const ut of userTrips) {
      await prisma.userTrip.deleteMany({ where: { tripId: ut.tripId } });
      await prisma.trip.delete({ where: { id: ut.tripId } }).catch(() => undefined);
    }
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
});

test("chat generation immediately creates Version 1 in DB without draft records", async () => {
  process.env.NODE_ENV = "test";
  const rows = await padangRows(4);
  const user = await prisma.user.create({
    data: { name: "Instant Test", username: `u-${randomUUID()}`, email: `instant-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);

  const findUserById = async (id: string) =>
    prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } });

  const itineraryService = createItineraryService({
    findUserById,
  });

  const chatService = createChatService({
    findUserById,
    itinerary: itineraryService,
    classifyMessage: async () => ({ intent: "generate_itinerary", source: "rule" as const }),
    completeAiChat: async () => ({
      content: null,
      finishReason: "tool_calls",
      toolCalls: [{ id: "call-1", name: "search_destinations", arguments: { categories: ["pantai"] } }],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    }),
    searchDestinations: async () => rows.map((r) => ({ ...r, city: "Padang", isActive: true, details: {}, categories: [{ slug: r.category }] })),
    getDestinationDetails: async ({ destinationIds }) =>
      rows.filter((r) => destinationIds.includes(r.id)).map((r) => ({ ...r, city: "Padang", isActive: true, details: {}, categories: [{ slug: r.category }] })),
  });

  const app = new Hono();
  app.onError(errorHandler);
  app.route("/api/v1/chat", createChatApi(chatService));

  const sessionRes = await app.request("/api/v1/chat/sessions", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ userId: user.id, title: "Padang Trip" }),
  });
  assert.equal(sessionRes.status, 201);
  const sessionBody = (await sessionRes.json()) as { data: { id: string } };
  const sessionId = sessionBody.data.id;

  const msgRes = await app.request(`/api/v1/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ userId: user.id, content: "Buat itinerary di Padang untuk 1 hari" }),
  });
  assert.equal(msgRes.status, 200);
  const first = (await msgRes.json()) as { data: { intent: string; version: unknown } };
  assert.equal(first.data.intent, "missing_information", "missing category is asked, not invented");
  assert.equal(first.data.version, null);

  const answer = await app.request(`/api/v1/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ userId: user.id, content: "pantai" }),
  });
  assert.equal(answer.status, 200);

  const trip = await prisma.trip.findUnique({ where: { chatSessionId: sessionId } });
  assert.ok(trip, "Trip must exist for session");

  const batchRows = await prisma.tripDestination.findMany({
    where: { tripId: trip.id },
    orderBy: { visitAt: "asc" },
    select: { id: true },
  });
  assert.ok(batchRows.length > 0, "Trip must have destinations");
  assert.equal(await prisma.tripDestination.count({ where: { tripId: trip.id } }), rows.length);
});
