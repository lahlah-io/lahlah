import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/db/client.js";
import { createChatService } from "../../src/modules/chat/index.js";
import { createItineraryService } from "../../src/modules/itinerary/index.js";
import * as usersRepository from "../../src/modules/users/repositories/users.repository.js";

type ChatServiceLike = ReturnType<typeof createChatService>;

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

function services(rows: Row[]) {
  const itinerary = createItineraryService({
    getDraft: () => {
      throw new Error("draft store should not be used by the version flow");
    },
    findUserById,
  });
  const chat = createChatService({
    itinerary,
    findUserById,
    classifyMessage: async () => ({ intent: "modify_itinerary", source: "rule" }),
    searchDestinations: async () => rows.map((r) => ({ ...r, categories: [{ slug: r.category }] })),
    getDestinationDetails: async () => rows.map((r) => ({ ...r, categories: [{ slug: r.category }] })),
  }) as ChatServiceLike;
  return { itinerary, chat };
}

async function setup() {
  const user = await prisma.user.create({
    data: { name: "Modify Test", email: `modify-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "chat-modify-version" } },
    update: {},
    create: { provider: "test", modelIdentifier: "chat-modify-version", name: "chat-modify-version", isActive: true },
    select: { id: true },
  });
  const session = await prisma.chatSession.create({
    data: { userId: user.id, modelId: model.id, title: "modify" },
    select: { id: true },
  });
  const rows = await padangRows(7);
  const { itinerary, chat } = services(rows);
  const v1 = await itinerary.saveDraftVersion({
    userId: user.id,
    sessionId: session.id,
    travelDate: "2026-11-21",
    startTime: "08:00",
    endTime: "18:00",
    stops: rows.slice(0, 6).map((r, i) => ({
      position: i + 1,
      destinationId: r.id,
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      arrivalTime: `${String(8 + i).padStart(2, "0")}:00`,
      visitDurationMin: 60,
      category: r.category,
    })),
    routeJson: { type: "LineString", coordinates: rows.slice(0, 6).map((r) => [r.longitude, r.latitude]), legs: [] },
    changeType: "generate",
  });
  return { user, session, rows, itinerary, chat, v1 };
}

async function send(chat: ChatServiceLike, userId: string, sessionId: string, content: string) {
  const res = await chat.sendMessage({ userId, sessionId, content });
  return res.data as {
    intent: string;
    draft: { draftId: string; destinations: Array<{ destinationId: string }> };
    version: { id: string } | null;
    map: { versionId: string; points: Array<{ destinationId: string }> } | null;
  };
}

beforeAll(() => {
  process.env.NODE_ENV = "test";
});

afterAll(async () => {
  for (const userId of createdUserIds) {
    await prisma.itineraryStop.deleteMany({ where: { version: { itinerary: { userId } } } });
    await prisma.itineraryVersion.deleteMany({ where: { itinerary: { userId } } });
    await prisma.destinationCheckpoint.deleteMany({ where: { itineraryDestination: { itinerary: { userId } } } });
    await prisma.itineraryDestination.deleteMany({ where: { itinerary: { userId } } });
    await prisma.itinerary.deleteMany({ where: { userId } });
    await prisma.chatMessage.deleteMany({ where: { session: { userId } } });
    await prisma.chatSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
  if (PREV_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = PREV_NODE_ENV;
});

test("replace keeps count, writes V2, and returns every map point", async () => {
  const { user, session, chat, itinerary, v1 } = await setup();
  const out = await send(chat, user.id, session.id, "ganti destinasi ke-4");

  assert.equal(out.intent, "modify_itinerary");
  assert.equal(out.draft.destinations.length, 6);
  assert.notEqual(out.draft.draftId, v1.versionId);
  assert.equal(out.version!.id, out.draft.draftId);
  assert.equal(out.map!.versionId, out.draft.draftId);
  assert.equal(out.map!.points.length, 6);

  const v2 = await itinerary.getActiveVersion({ userId: user.id, sessionId: session.id });
  assert.equal(v2!.versionNumber, 2);
  assert.equal(v2!.stops.length, 6);
  const row = await prisma.itineraryVersion.findUnique({
    where: { id: v2!.versionId },
    select: { basedOnVersion: true, sourceMessageId: true },
  });
  assert.equal(row!.basedOnVersion, 1);
  assert.ok(row!.sourceMessageId, "source message link is stored");
});

test("remove drops one row, add appends, and versions stay immutable", async () => {
  const { user, session, chat, itinerary } = await setup();
  const removed = await send(chat, user.id, session.id, "hapus destinasi nomor 4");
  assert.equal(removed.draft.destinations.length, 5);

  const added = await send(chat, user.id, session.id, "tambah 1 destinasi");
  assert.equal(added.draft.destinations.length, 6);

  const itineraryId = (
    await itinerary.getActiveVersion({ userId: user.id, sessionId: session.id })
  )!.itineraryId;
  const list = await itinerary.listVersions({ id: itineraryId, userId: user.id });
  assert.deepEqual(list.data.map((v) => v.version), [1, 2, 3]);

  const v1 = await prisma.itineraryVersion.findUnique({
    where: { itineraryId_version: { itineraryId, version: 1 } },
    select: { _count: { select: { stops: true } } },
  });
  assert.equal(v1!._count.stops, 6, "V1 stops were not rewritten");
});

test("publish copies the selected version into final rows", async () => {
  const { user, session, chat, itinerary } = await setup();
  await send(chat, user.id, session.id, "hapus destinasi nomor 4");
  const active = await itinerary.getActiveVersion({ userId: user.id, sessionId: session.id });

  await itinerary.publishVersion({ id: active!.itineraryId, userId: user.id, version: 1 });
  const v1Stops = await prisma.itineraryStop.findMany({
    where: { version: { itineraryId: active!.itineraryId, version: 1 } },
    orderBy: { position: "asc" },
    select: { destinationId: true },
  });
  const finalRows = await prisma.itineraryDestination.findMany({
    where: { itineraryId: active!.itineraryId },
    select: { destinationId: true },
  });
  assert.deepEqual(new Set(finalRows.map((r) => r.destinationId)), new Set(v1Stops.map((s) => s.destinationId)));

  const root = await prisma.itinerary.findUniqueOrThrow({
    where: { id: active!.itineraryId },
    select: { currentVersion: true },
  });
  assert.equal(root.currentVersion, 1);
});
