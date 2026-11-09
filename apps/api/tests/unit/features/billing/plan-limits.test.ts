import assert from "node:assert/strict";
import test from "node:test";
import {
  FREE_PLAN_LIMITS,
  parsePlanLimits,
  planLimitsSchema,
} from "../../../../src/shared/billing/plan-limits.schema.js";

test("details kosong memakai default unlimited", () => {
  assert.deepEqual(parsePlanLimits({}), {
    chatMessagesPerMonth: null,
    maxChatSessions: null,
    maxItineraries: null,
    allowedModelIds: null,
  });
  assert.deepEqual(parsePlanLimits(null), {
    chatMessagesPerMonth: null,
    maxChatSessions: null,
    maxItineraries: null,
    allowedModelIds: null,
  });
});

test("details valid dipertahankan dan key masa depan tidak dibuang", () => {
  const details = planLimitsSchema.parse({
    chatMessagesPerMonth: 30,
    maxItineraries: 3,
    futureKey: "tetap-ada",
  });
  assert.equal(details.chatMessagesPerMonth, 30);
  assert.equal(details.maxItineraries, 3);
  assert.deepEqual((details as Record<string, unknown>).futureKey, "tetap-ada");
});

test("details tidak valid ditolak", () => {
  assert.throws(() => parsePlanLimits({ chatMessagesPerMonth: -1 }));
  assert.throws(() => parsePlanLimits({ allowedModelIds: ["bukan-uuid"] }));
  assert.throws(() => parsePlanLimits({ chatMessagesPerMonth: 1.5 }));
});

test("default plan free sesuai seed migrasi", () => {
  assert.equal(FREE_PLAN_LIMITS.chatMessagesPerMonth, 30);
  assert.equal(FREE_PLAN_LIMITS.maxChatSessions, 10);
  assert.equal(FREE_PLAN_LIMITS.maxItineraries, 3);
  assert.equal(FREE_PLAN_LIMITS.allowedModelIds, null);
});
