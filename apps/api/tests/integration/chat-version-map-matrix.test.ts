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
  assert.equal(replaced.version!.stops.length, 8, "MOD-002 replace keeps the count");
  assert.equal(replaced.map!.points.length, 8, "MAP-V002");
  assert.equal(replaced.map!.versionId, replaced.version!.versionId);

  const removed = await send(chat, user.id, session.id, "hapus destinasi nomor 2");
  assert.equal(removed.version!.stops.length, 7, "MOD-003 remove drops one row");
  assert.equal(removed.map!.points.length, 7, "MAP-V003");
  assert.deepEqual(
    removed.map!.points.map((p) => p.position),
    removed.version!.stops.map((s) => s.position),
    "MAP-V010 markers come only from the returned version",
  );

  const added = await send(chat, user.id, session.id, "tambah 1 destinasi");
  assert.equal(added.version!.stops.length, 8, "MOD-005 add appends one row");
  assert.equal(added.map!.points.length, 8, "MAP-V004");

  const active = await itinerary.getActiveVersion({ userId: user.id, sessionId: session.id });
  assert.equal(active!.versionNumber, 4, "VER-005 one new version per operation");
  assert.equal(active!.stops.length, 8);
});

test("VER-008 + MAP-V005: selecting an older version appends a copy of its stops", async () => {
  const { user, session, chat, itinerary, v1 } = await setup(8);
  await send(chat, user.id, session.id, "ganti destinasi ke-4");
  await send(chat, user.id, session.id, "hapus destinasi nomor 2");

  const selected = await send(chat, user.id, session.id, "pilih versi 1");
  assert.equal(selected.version!.stops.length, 8, "VER-008 selection uses V1 stops");
  assert.notEqual(selected.version!.versionId, v1.versionId);
  assert.equal(selected.map!.versionId, selected.version!.versionId, "MAP-V005");
  assert.equal(selected.map!.points.length, 8);

  const active = await itinerary.getActiveVersion({ userId: user.id, sessionId: session.id });
  assert.equal(active!.versionNumber, 4, "restore appends a new batch");
});

test("VER-013: another user cannot read or restore the version", async () => {
  const { user, session, itinerary } = await setup(8);
  const other = await createUser();
  createdUserIds.push(other.id);

  assert.equal(await itinerary.getActiveVersion({ userId: other.id, sessionId: session.id }), null);
  const id = (await itinerary.getActiveVersion({ userId: user.id, sessionId: session.id }))!.itineraryId;
  await assert.rejects(
    itinerary.restoreVersion({ id, userId: other.id, version: 1 }),
    (error: unknown) => error instanceof HttpError && error.status === 404,
  );
});

test("VER-014: stop details resolve from the destination master row", async () => {
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
    assert.equal(active!.stops[0]!.name, "Nama Master Baru");
  } finally {
    await cleanupUser(user.id);
    await prisma.destination.delete({ where: { id: destination.id } });
  }
});

test("MAP-V009: a version without mapped stops is rejected as empty", async () => {
  const user = await createUser();
  createdUserIds.push(user.id);
  const session = await createSession(user.id, "empty-map");
  const { itinerary } = createServices([]);

  await assert.rejects(
    itinerary.saveDraftVersion({
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
    }),
    (error: unknown) => error instanceof HttpError && error.status === 422,
  );
});
