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

test("replace keeps count, appends a new batch, and returns every map point", async () => {
  const { user, session, chat, itinerary, v1 } = await setup();
  const out = await send(chat, user.id, session.id, "ganti destinasi ke-4");

  assert.equal(out.intent, "modify_itinerary");
  assert.equal(out.version!.stops.length, 6);
  assert.notEqual(out.version!.versionId, v1.versionId);
  assert.equal(out.map!.versionId, out.version!.versionId);
  assert.equal(out.map!.points.length, 6);

  const v2 = await itinerary.getActiveVersion({ userId: user.id, sessionId: session.id });
  assert.equal(v2!.versionNumber, 2);
  assert.equal(v2!.stops.length, 6);

  const batches = await itinerary.listVersions({ id: v1.itineraryId, userId: user.id });
  assert.deepEqual(batches.data.map((b) => b.stopCount), [6, 6]);
});

test("remove drops one row, add appends, and old batches stay immutable", async () => {
  const { user, session, chat, itinerary, v1 } = await setup();
  const removed = await send(chat, user.id, session.id, "hapus destinasi nomor 4");
  assert.equal(removed.version!.stops.length, 5);

  const added = await send(chat, user.id, session.id, "tambah 1 destinasi");
  assert.equal(added.version!.stops.length, 6);

  const list = await itinerary.listVersions({ id: v1.itineraryId, userId: user.id });
  assert.deepEqual(list.data.map((b) => b.version), [1, 2, 3]);
  assert.deepEqual(list.data.map((b) => b.stopCount), [6, 5, 6]);

  const v1Rows = await prisma.tripDestination.count({
    where: { tripId: v1.itineraryId, createdAt: new Date(list.data[0]!.createdAt) },
  });
  assert.equal(v1Rows, 6, "V1 batch was not rewritten");
});
