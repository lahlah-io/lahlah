import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "vitest";
import { prisma } from "../../src/db/client.js";
import {
  cleanupUser,
  createModificationFixture,
  send,
} from "../fixtures/chat-version.js";

const PREV_NODE_ENV = process.env.NODE_ENV;
const createdUserIds: string[] = [];

async function setup(stopCount = 6) {
  const fixture = await createModificationFixture(stopCount);
  createdUserIds.push(fixture.user.id);
  return fixture;
}

beforeAll(() => {
  process.env.NODE_ENV = "test";
});

afterAll(async () => {
  for (const userId of createdUserIds) await cleanupUser(userId);
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
