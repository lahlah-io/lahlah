import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

type DraftStore = {
  saveDraft(input: { userId: string; sessionId: string; itinerary: unknown }): string;
  getDraft(input: { draftId: string; userId: string; sessionId: string }): unknown;
  replaceSessionDraft(input: { userId: string; sessionId: string; itinerary: unknown }): string;
  createDraftStore(input?: { ttlSeconds?: number; now?: () => number }): DraftStore;
};

async function loadStore() {
  const mod = await import("../../../../src/modules/chat/services/draft-store.js");
  return mod as typeof mod & DraftStore & {
    createDraftStore: (input?: { ttlSeconds?: number; now?: () => number }) => DraftStore;
  };
}

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
  const { createDraftStore } = await loadStore();
  const store = createDraftStore({ ttlSeconds: 1800, now: () => 1000 });
  const draftId = store.saveDraft({
    userId: "u1",
    sessionId: "s1",
    itinerary: sampleItinerary(),
  });
  assert.equal(typeof draftId, "string");
  const draft = store.getDraft({ draftId, userId: "u1", sessionId: "s1" }) as { draftId: string };
  assert.equal(draft.draftId, draftId);
  assert.equal((draft as { travelDate: string }).travelDate, "2026-11-10");
});

test("rejects read for other user or session", async () => {
  const { createDraftStore } = await loadStore();
  const store = createDraftStore({ ttlSeconds: 1800, now: () => 1000 });
  const draftId = store.saveDraft({ userId: "u1", sessionId: "s1", itinerary: sampleItinerary() });
  assert.throws(() => store.getDraft({ draftId, userId: "u2", sessionId: "s1" }));
  assert.throws(() => store.getDraft({ draftId, userId: "u1", sessionId: "s2" }));
});

test("rejects expired draft after TTL", async () => {
  const { createDraftStore } = await loadStore();
  let now = 1000;
  const store = createDraftStore({ ttlSeconds: 30, now: () => now });
  const draftId = store.saveDraft({ userId: "u1", sessionId: "s1", itinerary: sampleItinerary() });
  store.getDraft({ draftId, userId: "u1", sessionId: "s1" });
  now += 30_001;
  assert.throws(() => store.getDraft({ draftId, userId: "u1", sessionId: "s1" }));
});

test("replaceSessionDraft replaces active session draft", async () => {
  const { createDraftStore } = await loadStore();
  const store = createDraftStore({ ttlSeconds: 1800, now: () => 1000 });
  const first = store.replaceSessionDraft({
    userId: "u1",
    sessionId: "s1",
    itinerary: sampleItinerary({ travelDate: "2026-11-10" }),
  });
  const second = store.replaceSessionDraft({
    userId: "u1",
    sessionId: "s1",
    itinerary: sampleItinerary({ travelDate: "2026-11-11" }),
  });
  assert.notEqual(first, second);
  assert.throws(() => store.getDraft({ draftId: first, userId: "u1", sessionId: "s1" }));
  const draft = store.getDraft({ draftId: second, userId: "u1", sessionId: "s1" }) as { travelDate: string };
  assert.equal(draft.travelDate, "2026-11-11");
});

test("caller mutation does not affect stored draft", async () => {
  const { createDraftStore } = await loadStore();
  const store = createDraftStore({ ttlSeconds: 1800, now: () => 1000 });
  const input = sampleItinerary();
  const draftId = store.saveDraft({ userId: "u1", sessionId: "s1", itinerary: input });
  input.travelDate = "mutated";
  input.destinations[0]!.name = "mutated";
  (input.route!.coordinates[0] as number[])[0] = 0;
  const draft = store.getDraft({ draftId, userId: "u1", sessionId: "s1" }) as {
    travelDate: string;
    destinations: Array<{ name: string }>;
    route: { coordinates: number[][] } | null;
  };
  assert.equal(draft.travelDate, "2026-11-10");
  assert.equal(draft.destinations[0]!.name, "Pantai Air Manis");
  assert.equal(draft.route!.coordinates[0]![0], 100.36);

  draft.travelDate = "mutated-out";
  const again = store.getDraft({ draftId, userId: "u1", sessionId: "s1" }) as { travelDate: string };
  assert.equal(again.travelDate, "2026-11-10");
});
