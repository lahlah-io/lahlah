import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, test } from "vitest";
import { prisma } from "../../src/db/client.js";
import { createDraftStore, type ItineraryDraftResponse } from "../../src/modules/chat/services/draft-store.js";

async function createUser(label: string) {
  return prisma.user.create({
    data: { name: label, email: `${label}-${randomUUID()}@example.test` },
    select: { id: true },
  });
}

async function ensureModel() {
  return prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "draft-persistence" } },
    update: {},
    create: { provider: "test", modelIdentifier: "draft-persistence", name: "draft-persistence", isActive: true },
    select: { id: true },
  });
}

async function createSession(userId: string) {
  const model = await ensureModel();
  return prisma.chatSession.create({ data: { userId, modelId: model.id, title: "draft-persist" }, select: { id: true } });
}

function sampleItinerary(overrides: Record<string, unknown> = {}): ItineraryDraftResponse {
  return {
    draftId: "placeholder",
    status: "pending_confirmation",
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
    route: { type: "LineString", coordinates: [[100.36, -0.99]] },
    ...overrides,
  };
}

const createdUserIds: string[] = [];

afterAll(async () => {
  for (const userId of createdUserIds) {
    await prisma.itineraryDraft.deleteMany({ where: { userId } });
    await prisma.chatSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
});

test("draft persists across new store instance (restart) with compat shape", async () => {
  const user = await createUser("persist");
  createdUserIds.push(user.id);
  const session = await createSession(user.id);
  const storeA = createDraftStore({ ttlSeconds: 1800, now: () => 1000 });
  const draftId = await storeA.saveDraft({ userId: user.id, sessionId: session.id, itinerary: sampleItinerary() });

  const storeB = createDraftStore({ ttlSeconds: 1800, now: () => 1000 });
  const draft = await storeB.getDraft({ draftId, userId: user.id, sessionId: session.id });
  assert.equal(draft.draftId, draftId);
  assert.equal(draft.status, "pending_confirmation");
  assert.equal(draft.travelDate, "2026-11-10");
  assert.equal(draft.destinations[0]?.name, "Pantai Air Manis");
  assert.deepEqual(draft.route, { type: "LineString", coordinates: [[100.36, -0.99]] });
});

test("draft enforces owner/session checks and expiry across instances", async () => {
  const user = await createUser("owner-persist");
  const other = await createUser("other-persist");
  createdUserIds.push(user.id, other.id);
  const session = await createSession(user.id);
  const otherSession = await createSession(other.id);
  let now = 2000;
  const storeA = createDraftStore({ ttlSeconds: 30, now: () => now });
  const draftId = await storeA.saveDraft({ userId: user.id, sessionId: session.id, itinerary: sampleItinerary() });

  const storeB = createDraftStore({ ttlSeconds: 30, now: () => now });
  await assert.rejects(() => storeB.getDraft({ draftId, userId: other.id, sessionId: session.id }));
  await assert.rejects(() => storeB.getDraft({ draftId, userId: user.id, sessionId: otherSession.id }));

  now += 30_001;
  await assert.rejects(() => storeB.getDraft({ draftId, userId: user.id, sessionId: session.id }));
});

test("replace active draft persists and invalidates old id across instances", async () => {
  const user = await createUser("replace-persist");
  createdUserIds.push(user.id);
  const session = await createSession(user.id);
  const storeA = createDraftStore({ ttlSeconds: 1800, now: () => 3000 });
  const first = await storeA.replaceSessionDraft({
    userId: user.id,
    sessionId: session.id,
    itinerary: sampleItinerary({ travelDate: "2026-11-10" }),
  });
  const second = await storeA.replaceSessionDraft({
    userId: user.id,
    sessionId: session.id,
    itinerary: sampleItinerary({ travelDate: "2026-11-11" }),
  });
  assert.notEqual(first, second);

  const storeB = createDraftStore({ ttlSeconds: 1800, now: () => 3000 });
  await assert.rejects(() => storeB.getDraft({ draftId: first, userId: user.id, sessionId: session.id }));
  const draft = await storeB.getDraft({ draftId: second, userId: user.id, sessionId: session.id });
  assert.equal(draft.draftId, second);
  assert.equal(draft.travelDate, "2026-11-11");
});
