import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "vitest";
import { HttpError } from "../../src/shared/http/errors.js";
import { prisma } from "../../src/db/client.js";
import {
  cleanupUser,
  createModificationFixture,
  createServices,
  createSession,
  createUser,
  send,
} from "../fixtures/chat-version.js";

const PREV_NODE_ENV = process.env.NODE_ENV;
const createdUserIds: string[] = [];

async function setup(stopCount = 8) {
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

test("MOD-002/003/005 + MAP-V001..004/V010: counts and markers follow the returned version", async () => {
  const { user, session, chat, itinerary } = await setup(8);

  const replaced = await send(chat, user.id, session.id, "ganti destinasi ke-4");
  assert.equal(replaced.draft.destinations.length, 8, "MOD-002 replace keeps the count");
  assert.equal(replaced.map!.points.length, 8, "MAP-V002");
  assert.equal(replaced.map!.versionId, replaced.draft.draftId);

  const removed = await send(chat, user.id, session.id, "hapus destinasi nomor 2");
  assert.equal(removed.draft.destinations.length, 7, "MOD-003 remove drops one row");
  assert.equal(removed.map!.points.length, 7, "MAP-V003");
  assert.deepEqual(
    removed.map!.points.map((p) => p.position),
    removed.draft.destinations.map((d) => d.order),
    "MAP-V010 markers come only from the returned version",
  );

  const added = await send(chat, user.id, session.id, "tambah 1 destinasi");
  assert.equal(added.draft.destinations.length, 8, "MOD-005 add appends one row");
  assert.equal(added.map!.points.length, 8, "MAP-V004");

  const active = await itinerary.getActiveVersion({ userId: user.id, sessionId: session.id });
  assert.equal(active!.versionNumber, 4, "VER-005 one new version per operation");
  assert.equal(active!.stops.length, 8);
});

test("VER-008 + MAP-V005: selecting an older version reloads its markers", async () => {
  const { user, session, chat, itinerary, v1 } = await setup(8);
  await send(chat, user.id, session.id, "ganti destinasi ke-4");
  await send(chat, user.id, session.id, "hapus destinasi nomor 2");

  const selected = await send(chat, user.id, session.id, "pilih versi 1");
  assert.equal(selected.draft.destinations.length, 8, "VER-008 selection uses V1 stops");
  assert.equal(selected.draft.draftId, v1.versionId);
  assert.equal(selected.map!.versionId, v1.versionId, "MAP-V005");
  assert.equal(selected.map!.points.length, 8);

  const active = await itinerary.getActiveVersion({ userId: user.id, sessionId: session.id });
  assert.equal(active!.versionNumber, 1);
});

test("VER-013: another user cannot read or publish the version", async () => {
  const { user, session, itinerary } = await setup(8);
  const other = await createUser();
  createdUserIds.push(other.id);

  assert.equal(await itinerary.getActiveVersion({ userId: other.id, sessionId: session.id }), null);
  await assert.rejects(
    itinerary.publishVersion({ id: (await itinerary.getActiveVersion({ userId: user.id, sessionId: session.id }))!.itineraryId, userId: other.id, version: 1 }),
    (error: unknown) => error instanceof HttpError && error.status === 404,
  );
});

test("VER-014: version stop names survive master destination edits", async () => {
  const user = await createUser();
  createdUserIds.push(user.id);
  const session = await createSession(user.id, "snapshot");
  const { itinerary } = createServices([]);
  const destination = await prisma.destination.create({
    data: { name: "Nama Snapshot", city: "Padang", latitude: -0.95, longitude: 100.35, source: "manual", isActive: true },
    select: { id: true },
  });

  try {
    await itinerary.saveDraftVersion({
      userId: user.id,
      sessionId: session.id,
      travelDate: "2026-11-22",
      startTime: "09:00",
      endTime: "12:00",
      stops: [{
        position: 1,
        destinationId: destination.id,
        name: "Nama Snapshot",
        latitude: -0.95,
        longitude: 100.35,
        arrivalTime: "09:00",
        visitDurationMin: 60,
        category: null,
      }],
      routeJson: null,
      changeType: "generate",
    });

    await prisma.destination.update({ where: { id: destination.id }, data: { name: "Nama Master Baru" } });

    const active = await itinerary.getActiveVersion({ userId: user.id, sessionId: session.id });
    assert.equal(active!.stops[0]!.name, "Nama Snapshot");
  } finally {
    await cleanupUser(user.id);
    await prisma.destination.delete({ where: { id: destination.id } });
  }
});

test("MAP-V009: a version without mapped stops returns an empty marker list", async () => {
  const user = await createUser();
  createdUserIds.push(user.id);
  const session = await createSession(user.id, "empty-map");
  const { itinerary, chat } = createServices([]);

  await itinerary.saveDraftVersion({
    userId: user.id,
    sessionId: session.id,
    travelDate: "2026-11-23",
    startTime: "09:00",
    endTime: "12:00",
    stops: [{
      position: 1,
      destinationId: null,
      name: "Tanpa Destinasi",
      latitude: 0,
      longitude: 0,
      arrivalTime: "09:00",
      visitDurationMin: 60,
      category: null,
    }],
    routeJson: null,
    changeType: "generate",
  });

  const selected = await send(chat, user.id, session.id, "pilih versi 1");
  assert.equal(selected.draft.destinations.length, 0);
  assert.deepEqual(selected.map!.points, []);
});
