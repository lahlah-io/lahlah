import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "vitest";
import { createChatService } from "../../src/modules/chat/index.js";
import { createItineraryService } from "../../src/modules/itinerary/index.js";
import * as usersRepository from "../../src/modules/users/repositories/users.repository.js";
import {
  cleanupUser,
  createModificationFixture,
  createSession,
  createServices,
  createUser,
  padangRows,
  send,
  type Row,
} from "../fixtures/chat-version.js";

const PREV_NODE_ENV = process.env.NODE_ENV;
const createdUserIds: string[] = [];

const findUserById = async (id: string) =>
  usersRepository.findUserById(id).then((u) => (u ? { id: u.id, isActive: u.isActive } : null));

function toolRow(r: Row) {
  return { ...r, city: "Padang", isActive: true, details: {}, categories: [{ slug: r.category }] };
}

function makeChat(rows: Row[], intent: "generate_itinerary" | "modify_itinerary") {
  const itinerary = createItineraryService({ findUserById });
  const chat = createChatService({
    itinerary,
    findUserById,
    classifyMessage: async () => ({ intent, source: "rule" as const }),
    completeAiChat: async () => ({
      content: null,
      finishReason: "tool_calls",
      toolCalls: [{ id: "call-1", name: "search_destinations", arguments: { categories: ["santai"] } }],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }),
    searchDestinations: async () => rows.map(toolRow),
    getDestinationDetails: async ({ destinationIds }) => rows.filter((r) => destinationIds.includes(r.id)).map(toolRow),
  });
  return { itinerary, chat };
}

function makeAliasChat(rows: Row[]) {
  return createChatService({
    itinerary: createItineraryService({ findUserById }),
    findUserById,
    classifyMessage: async () => ({ intent: "generate_itinerary", source: "rule" as const }),
    completeAiChat: async () => ({
      content: null,
      finishReason: "tool_calls",
      toolCalls: [{ id: "call-1", name: "fetch_destinations_by_category", arguments: { category: "pantai" } }],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }),
    searchDestinations: async () => rows.map(toolRow),
    getDestinationDetails: async ({ destinationIds }) => rows.filter((r) => destinationIds.includes(r.id)).map(toolRow),
  });
}

beforeAll(() => {
  process.env.NODE_ENV = "test";
});

afterAll(async () => {
  for (const userId of createdUserIds) await cleanupUser(userId);
  if (PREV_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = PREV_NODE_ENV;
});

test("ambiguous time asks once instead of inventing a schedule", async () => {
  const user = await createUser();
  createdUserIds.push(user.id);
  const session = await createSession(user.id, "ask-time");
  const { chat } = createServices([]);

  const out = await send(chat, user.id, session.id, "saya mau ngedate besok");
  assert.equal(out.intent, "missing_information");
  assert.match((out as unknown as { message: string }).message, /Jam berapa/);
  assert.equal(out.version, null);
});

test("deferring the time gets a recommended slot and builds the trip", async () => {
  const rows = await padangRows(5);
  const user = await createUser();
  createdUserIds.push(user.id);
  const session = await createSession(user.id, "defer-time");
  const { chat } = makeChat(rows, "generate_itinerary");

  const asked = await send(chat, user.id, session.id, "saya mau ngedate besok");
  assert.equal(asked.intent, "missing_information");

  const built = await send(chat, user.id, session.id, "kasih saja saran");
  assert.ok(built.version, "trip is built after the user defers");
  assert.equal(built.version!.startTime, "15:00");
  assert.ok(built.version!.stops.length > 0);
});

test("seharian starts at 08:00, honors an explicit count, and identical reruns add no batch", async () => {
  const rows = await padangRows(5);
  const user = await createUser();
  createdUserIds.push(user.id);
  const session = await createSession(user.id, "full-day");
  const { itinerary, chat } = makeChat(rows, "generate_itinerary");

  const first = await send(chat, user.id, session.id, "buat itinerary pantai seharian 3 destinasi");
  assert.ok(first.version);
  assert.equal(first.version!.startTime, "08:00");
  assert.equal(first.version!.stops.length, 3);

  const again = await send(chat, user.id, session.id, "buat itinerary pantai seharian 3 destinasi");
  assert.equal(again.version!.versionId, first.version!.versionId, "identical rerun reuses the active version");
  const list = await itinerary.listVersions({ id: first.version!.itineraryId, userId: user.id });
  assert.equal(list.data.length, 1);
});

test("deferring both category and time builds a trip without asking again", async () => {
  const rows = await padangRows(5);
  const user = await createUser();
  createdUserIds.push(user.id);
  const session = await createSession(user.id, "defer-both");
  const { chat } = makeChat(rows, "generate_itinerary");

  const asked = await send(chat, user.id, session.id, "saya mau pergi sama pasangan saya besok");
  assert.equal(asked.intent, "missing_information");
  const question = (asked as unknown as { message: string }).message;
  assert.match(question, /Mau ke tempat seperti apa/);
  assert.match(question, /Jam berapa/);
  assert.equal(asked.version, null);

  const built = await send(chat, user.id, session.id, "berikan saya saran aja saya serahkan ke anda");
  assert.ok(built.version, "trip is built after the user defers both fields");
  assert.ok(built.version!.stops.length > 0);
  assert.match((built as unknown as { message: string }).message, /kategori pilihan saya/);
});

test("a hallucinated tool name is aliased to search_destinations instead of failing", async () => {
  const rows = await padangRows(3);
  const user = await createUser();
  createdUserIds.push(user.id);
  const session = await createSession(user.id, "tool-alias");
  const chat = makeAliasChat(rows);

  const out = await send(chat, user.id, session.id, "buat itinerary pantai seharian");
  assert.ok(out.version);
  assert.ok(out.version!.stops.length > 0);
});

test("feedback about a finished trip regenerates it without asking the time again", async () => {
  const fixture = await createModificationFixture(6);
  createdUserIds.push(fixture.user.id);
  const chat = createChatService({
    itinerary: fixture.itinerary,
    findUserById,
    classifyMessage: async () => ({ intent: "feedback_itinerary", source: "rule" as const }),
    completeAiChat: async () => ({
      content: null,
      finishReason: "tool_calls",
      toolCalls: [{ id: "call-1", name: "search_destinations", arguments: {} }],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }),
    searchDestinations: async () => fixture.rows.map(toolRow),
    getDestinationDetails: async ({ destinationIds }) =>
      fixture.rows.filter((r) => destinationIds.includes(r.id)).map(toolRow),
  });

  const out = await send(chat, fixture.user.id, fixture.session.id, "ini tidak masuk akal, makan terus");
  assert.ok(out.version, "feedback rebuilds the trip");
  assert.equal(out.version!.travelDate, fixture.v1.travelDate);
  assert.equal(out.version!.startTime, "08:00");
  assert.doesNotMatch((out as unknown as { message: string }).message, /Jam berapa/);
});

test("bare modification never writes a version", async () => {
  const fixture = await createModificationFixture(6);
  createdUserIds.push(fixture.user.id);

  const before = await fixture.itinerary.listVersions({ id: fixture.v1.itineraryId, userId: fixture.user.id });
  const out = await send(fixture.chat, fixture.user.id, fixture.session.id, "ganti dong");
  assert.equal(out.version!.versionId, fixture.v1.versionId);
  const after = await fixture.itinerary.listVersions({ id: fixture.v1.itineraryId, userId: fixture.user.id });
  assert.equal(after.data.length, before.data.length);
});

test("changing the second stop updates only that position", async () => {
  const fixture = await createModificationFixture(6);
  createdUserIds.push(fixture.user.id);
  const v1Ids = fixture.v1.stops.map((s) => s.destinationId);

  const out = await send(fixture.chat, fixture.user.id, fixture.session.id, "ganti destinasi ke-2");
  const ids = out.version!.stops.map((s) => s.destinationId);
  assert.equal(ids.length, v1Ids.length);
  assert.notEqual(ids[1], v1Ids[1]);
  assert.equal(ids[0], v1Ids[0]);
  assert.equal(ids[2], v1Ids[2]);
});

test("changing the start time reschedules the same destinations and is idempotent", async () => {
  const fixture = await createModificationFixture(6);
  createdUserIds.push(fixture.user.id);
  const v1Ids = fixture.v1.stops.map((s) => s.destinationId);

  const changed = await send(fixture.chat, fixture.user.id, fixture.session.id, "ubah jam jadi 10 pagi");
  assert.equal(changed.version!.versionNumber, 2);
  assert.deepEqual(changed.version!.stops.map((s) => s.destinationId), v1Ids);
  assert.equal(changed.version!.stops[0]!.arrivalTime, "10:00");

  const repeated = await send(fixture.chat, fixture.user.id, fixture.session.id, "ubah jam jadi 10 pagi");
  assert.equal(repeated.version!.versionId, changed.version!.versionId, "same schedule writes no new batch");

  const list = await fixture.itinerary.listVersions({ id: fixture.v1.itineraryId, userId: fixture.user.id });
  assert.equal(list.data.length, 2);
});
