import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/db/client.js";
import { createChatService } from "../../src/modules/chat/index.js";
import { createItineraryService } from "../../src/modules/itinerary/index.js";
import * as usersRepository from "../../src/modules/users/repositories/users.repository.js";
import type { ItineraryVersionView } from "../../src/shared/schemas/itinerary-version.js";

export type Row = { id: string; name: string; latitude: number; longitude: number; category: string };
export type ChatServiceLike = ReturnType<typeof createChatService>;
export type SentReply = {
  intent: string;
  version: ItineraryVersionView | null;
  map: { versionId: string; points: Array<{ position: number; destinationId: string }> } | null;
};

export async function padangRows(min: number): Promise<Row[]> {
  const rows = await prisma.destination.findMany({
    where: { city: "Padang", isActive: true, latitude: { not: null }, longitude: { not: null } },
    take: min,
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, latitude: true, longitude: true, categories: { select: { category: { select: { slug: true } } } } },
  });
  assert.ok(rows.length >= min, `need >=${min} active Padang destinations (run seed)`);
  return rows.map((r, i) => ({
    id: r.id,
    name: r.name,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    category: r.categories[0]?.category.slug ?? `cat-${i}`,
  }));
}

const findUserById = async (id: string) =>
  usersRepository.findUserById(id).then((u) => (u ? { id: u.id, isActive: u.isActive } : null));

export function createServices(rows: Row[]) {
  const itinerary = createItineraryService({
    findUserById,
  });
  const chat = createChatService({
    itinerary,
    findUserById,
    classifyMessage: async () => ({ intent: "modify_itinerary", source: "rule" }),
    searchDestinations: async () => rows.map((r) => ({ ...r, categories: [{ slug: r.category }] })),
    getDestinationDetails: async () => rows.map((r) => ({ ...r, categories: [{ slug: r.category }] })),
  });
  return { itinerary, chat };
}

export async function createUser() {
  return prisma.user.create({
    data: { name: "Version Fixture", username: `u-${randomUUID()}`, email: `version-${randomUUID()}@example.test` },
    select: { id: true },
  });
}

export async function createSession(userId: string, title = "version") {
  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "itinerary-version-fixture" } },
    update: {},
    create: { provider: "test", modelIdentifier: "itinerary-version-fixture", name: "itinerary-version-fixture", isActive: true },
    select: { id: true },
  });
  return prisma.chatSession.create({ data: { userId, modelId: model.id, title }, select: { id: true } });
}

/** User, session, seeded V1, and services sharing the same destination rows. */
export async function createModificationFixture(stopCount = 6) {
  const user = await prisma.user.create({
    data: { name: "Modify Test", username: `u-${randomUUID()}`, email: `modify-${randomUUID()}@example.test` },
    select: { id: true },
  });
  const session = await createSession(user.id, "modify");
  const rows = await padangRows(stopCount + 3);
  const { itinerary, chat } = createServices(rows);
  const v1 = await itinerary.saveDraftVersion({
    userId: user.id,
    sessionId: session.id,
    travelDate: "2026-11-21",
    startTime: "08:00",
    endTime: "18:00",
    stops: rows.slice(0, stopCount).map((r, i) => ({
      position: i + 1,
      destinationId: r.id,
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      arrivalTime: `${String(8 + i).padStart(2, "0")}:00`,
      visitDurationMin: 60,
      category: r.category,
    })),
    routeJson: {
      type: "LineString",
      coordinates: rows.slice(0, stopCount).map((r) => [r.longitude, r.latitude]),
      legs: [],
    },
    changeType: "generate",
  });
  return { user, session, rows, itinerary, chat, v1 };
}

export async function send(chat: ChatServiceLike, userId: string, sessionId: string, content: string) {
  const res = await chat.sendMessage({ userId, sessionId, content });
  return res.data as SentReply;
}

export async function cleanupUser(userId: string) {
  await prisma.tripStop.deleteMany({ where: { version: { trip: { members: { some: { userId } } } } } });
  await prisma.tripVersion.deleteMany({ where: { trip: { members: { some: { userId } } } } });
  await prisma.destinationCheckpoint.deleteMany({ where: { tripDestination: { trip: { members: { some: { userId } } } } } });
  await prisma.tripDestination.deleteMany({ where: { trip: { members: { some: { userId } } } } });
  await prisma.trip.deleteMany({ where: { members: { some: { userId } } } });
  await prisma.chatMessage.deleteMany({ where: { session: { userId } } });
  await prisma.chatSession.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}
