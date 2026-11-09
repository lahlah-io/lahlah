import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  isModelAllowed,
  limitForMetric,
  quotaPeriod,
  toQuotaLimits,
} from "../../../../src/shared/billing/subscription.service.js";
import type { PlanLimits } from "../../../../src/shared/billing/plan-limits.schema.js";

const limits: PlanLimits = {
  chatMessagesPerMonth: 30,
  maxChatSessions: 10,
  maxItineraries: 3,
  allowedModelIds: null,
};

test("periode kuota mengikuti bulan kalender UTC", () => {
  const period = quotaPeriod(new Date("2026-11-08T23:59:59.000Z"));
  assert.equal(period.start.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(period.end.toISOString(), "2026-12-01T00:00:00.000Z");

  const december = quotaPeriod(new Date("2026-12-31T12:00:00.000Z"));
  assert.equal(december.start.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(december.end.toISOString(), "2027-01-01T00:00:00.000Z");
});

test("limit per metrik dipetakan dari details", () => {
  assert.equal(limitForMetric(limits, "chatMessages"), 30);
  assert.equal(limitForMetric(limits, "chatSessions"), 10);
  assert.equal(limitForMetric(limits, "itineraries"), 3);
  assert.deepEqual(toQuotaLimits(limits), {
    chatMessages: 30,
    chatSessions: 10,
    itineraries: 3,
  });
});

test("null berarti unlimited", () => {
  const unlimited: PlanLimits = {
    chatMessagesPerMonth: null,
    maxChatSessions: null,
    maxItineraries: null,
    allowedModelIds: null,
  };
  assert.equal(limitForMetric(unlimited, "chatMessages"), null);
});

test("allowedModelIds null membolehkan semua model", () => {
  const modelId = randomUUID();
  assert.equal(isModelAllowed(limits, modelId), true);
  assert.equal(isModelAllowed({ ...limits, allowedModelIds: [modelId] }, modelId), true);
  assert.equal(isModelAllowed({ ...limits, allowedModelIds: [] }, modelId), false);
});
