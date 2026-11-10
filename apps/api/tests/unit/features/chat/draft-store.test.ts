import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../../../src/db/client.js";
import { createDraftStore } from "../../../../src/modules/chat/services/draft-store.js";

async function createUser(label: string) {
  return prisma.user.create({
    data: { name: label, email: `${label}-${randomUUID()}@example.test` },
    select: { id: true },
  });
}

async function ensureModel() {
  return prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "draft-store-unit" } },
    update: {},
    create: { provider: "test", modelIdentifier: "draft-store-unit", name: "draft-store-unit", isActive: true },
    select: { id: true },
  });
}

async function createSession(userId: string) {
  const model = await ensureModel();
  return prisma.chatSession.create({ data: { userId, modelId: model.id, title: "draft-store" }, select: { id: true } });
}

const createdUserIds: string[] = [];

afterAll(async () => {
  for (const userId of createdUserIds) {
    await prisma.itineraryDraft.deleteMany({ where: { userId } });
    await prisma.chatSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
});

function sampleItinerary(overrides: Record<string, unknown> = {}) {
  return {
    draftId: "placeholder",
    status: "pending_confirmation" as const,
    travelDate: "2026-11-10",
    startTime: "08:00",
    endTime: "17:00",
    destinations: [
      {
        order: 1,
        destinationId: randomUUID(),
        name: "Pantai Air Manis",
        latitude: -0.99,
        longitude: 100.36,
        visitAt: "08:00",
        durationMinutes: 60,
      },
    ],
    route: { type: "LineString" as const, coordinates: [[100.36, -0.99]] as [number, number][] },
    ...overrides,
  };
}

test("owner can read saved draft", async () => {
  const user = await createUser("owner-read");
  createdUserIds.push(user.id);
  const session = await createSession(user.id);
  const store = createDraftStore({ ttlSeconds: 1800, now: () => 1000 });
  const draftId = await store.saveDraft({
    userId: user.id,
    sessionId: session.id,
    itinerary: sampleItinerary(),
  });
  assert.equal(typeof draftId, "string");
  const draft = await store.getDraft({ draftId, userId: user.id, sessionId: session.id });
  assert.equal(draft.draftId, draftId);
  assert.equal(draft.travelDate, "2026-11-10");
});

test("rejects read for other user or session", async () => {
  const user = await createUser("owner");
  const other = await createUser("other");
  createdUserIds.push(user.id, other.id);
  const session = await createSession(user.id);
  const otherSession = await createSession(other.id);
  const store = createDraftStore({ ttlSeconds: 1800, now: () => 1000 });
  const draftId = await store.saveDraft({ userId: user.id, sessionId: session.id, itinerary: sampleItinerary() });
  await assert.rejects(() => store.getDraft({ draftId, userId: other.id, sessionId: session.id }));
  await assert.rejects(() => store.getDraft({ draftId, userId: user.id, sessionId: otherSession.id }));
});

test("rejects expired draft after TTL", async () => {
  const user = await createUser("expired");
  createdUserIds.push(user.id);
  const session = await createSession(user.id);
  let now = 1000;
  const store = createDraftStore({ ttlSeconds: 30, now: () => now });
  const draftId = await store.saveDraft({ userId: user.id, sessionId: session.id, itinerary: sampleItinerary() });
  await store.getDraft({ draftId, userId: user.id, sessionId: session.id });
  now += 30_001;
  await assert.rejects(() => store.getDraft({ draftId, userId: user.id, sessionId: session.id }));
});

test("replaceSessionDraft replaces active session draft", async () => {
  const user = await createUser("replace");
  createdUserIds.push(user.id);
  const session = await createSession(user.id);
  const store = createDraftStore({ ttlSeconds: 1800, now: () => 1000 });
  const first = await store.replaceSessionDraft({
    userId: user.id,
    sessionId: session.id,
    itinerary: sampleItinerary({ travelDate: "2026-11-10" }),
  });
  const second = await store.replaceSessionDraft({
    userId: user.id,
    sessionId: session.id,
    itinerary: sampleItinerary({ travelDate: "2026-11-11" }),
  });
  assert.notEqual(first, second);
  await assert.rejects(() => store.getDraft({ draftId: first, userId: user.id, sessionId: session.id }));
  const draft = await store.getDraft({ draftId: second, userId: user.id, sessionId: session.id });
  assert.equal(draft.travelDate, "2026-11-11");
});

test("caller mutation does not affect stored draft", async () => {
  const user = await createUser("mutation");
  createdUserIds.push(user.id);
  const session = await createSession(user.id);
  const store = createDraftStore({ ttlSeconds: 1800, now: () => 1000 });
  const input = sampleItinerary();
  const draftId = await store.saveDraft({ userId: user.id, sessionId: session.id, itinerary: input });
  input.travelDate = "mutated";
  input.destinations[0]!.name = "mutated";
  (input.route!.coordinates[0] as number[])[0] = 0;
  const draft = await store.getDraft({ draftId, userId: user.id, sessionId: session.id });
  assert.equal(draft.travelDate, "2026-11-10");
  assert.equal(draft.destinations[0]!.name, "Pantai Air Manis");
  assert.equal(draft.route!.coordinates[0]![0], 100.36);

  draft.travelDate = "mutated-out";
  const again = await store.getDraft({ draftId, userId: user.id, sessionId: session.id });
  assert.equal(again.travelDate, "2026-11-10");
});
