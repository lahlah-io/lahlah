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

/** Sesi + service dengan model yang selalu bilang "ngobrol biasa" dan satu tool call. */
async function harness() {
  const rows = await padangRows(4);
  const user = await prisma.user.create({
    data: { name: "Deferral Test", username: `d-${randomUUID()}`, email: `deferral-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);

  const findUserById = async (id: string) =>
    prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } });
  const chatService = createChatService({
    findUserById,
    itinerary: createItineraryService({ findUserById }),
    // Model selalu bilang "ngobrol biasa": jalur trip harus dipicu aturan, bukan classifier.
    classifyMessage: async () => ({ intent: "general_chat", source: "rule" as const }),
    completeAiChat: async () => ({
      content: null,
      finishReason: "tool_calls",
      toolCalls: [{ id: "call-1", name: "search_destinations", arguments: {} }],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    }),
    searchDestinations: async () =>
      rows.map((r) => ({ ...r, city: "Padang", isActive: true, details: {}, categories: [{ slug: r.category }] })),
    getDestinationDetails: async ({ destinationIds }) =>
      rows.filter((r) => destinationIds.includes(r.id)).map((r) => ({ ...r, city: "Padang", isActive: true, details: {}, categories: [{ slug: r.category }] })),
    random: () => 0.5,
  });

  const app = new Hono();
  app.onError(errorHandler);
  app.route("/api/v1/chat", createChatApi(chatService));

  const sessionRes = await app.request("/api/v1/chat/sessions", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ userId: user.id, title: "Padang" }),
  });
  assert.equal(sessionRes.status, 201);
  const sessionId = ((await sessionRes.json()) as { data: { id: string } }).data.id;

  const send = async (content: string) => {
    const res = await app.request(`/api/v1/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ userId: user.id, content }),
    });
    assert.equal(res.status, 200, content);
    return (await res.json()) as { data: { version: { stops: unknown[] } | null } };
  };

  return { send, sessionId, userId: user.id };
}

test("delegasi 'kamu tentukan saja' membuat trip tanpa bertanya ulang", async () => {
  process.env.NODE_ENV = "test";
  const { send, sessionId } = await harness();

  const first = await send("aku besok kosong, apakah kamu ada saran?");
  assert.equal(first.data.version, null, "belum ada trip pada giliran pertama");

  const second = await send("aku ingin kamu tentukan saja!");
  assert.ok(second.data.version, "delegasi harus menghasilkan versi trip, bukan pertanyaan ulang");
  assert.ok(second.data.version.stops.length > 0, "trip harus berisi destinasi");

  const trip = await prisma.trip.findUnique({ where: { chatSessionId: sessionId } });
  assert.ok(trip, "trip tersimpan untuk sesi ini");
});

test("saran rekomendasi dengan kategori langsung menghasilkan trip", async () => {
  process.env.NODE_ENV = "test";
  const { send, sessionId } = await harness();

  const reply = await send("Rekomendasi kuliner Padang hari ini");
  assert.ok(reply.data.version, "permintaan rekomendasi harus langsung jadi trip");
  assert.ok(reply.data.version.stops.length > 0, "trip harus berisi destinasi");

  const trip = await prisma.trip.findUnique({ where: { chatSessionId: sessionId } });
  assert.ok(trip, "trip tersimpan untuk sesi ini");
});
