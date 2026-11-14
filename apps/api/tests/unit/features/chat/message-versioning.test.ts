import assert from "node:assert/strict";
import { test } from "vitest";
import { appendVersion, type MessageVersion } from "../../../../src/modules/chat/services/message-versioning.js";

test("sequential versions", () => {
  const v1: MessageVersion = {
    version: 1,
    content: "first",
    status: "completed",
    createdAt: "2026-11-10T00:00:00.000Z",
    usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
  };
  const current = {
    versionsJson: [v1],
    activeVersion: 1,
    content: "first",
    status: "completed",
    inputTokens: 1,
    outputTokens: 2,
  };

  const v2: MessageVersion = {
    version: 2,
    content: "second",
    status: "completed",
    createdAt: "2026-11-10T00:01:00.000Z",
    usage: { promptTokens: 4, completionTokens: 5, totalTokens: 9 },
  };

  const out = appendVersion(current, v2);
  assert.equal(out.activeVersion, 2);
  assert.equal(out.versionsJson.length, 2);
  assert.deepEqual(out.versionsJson.map((v) => v.version), [1, 2]);
  assert.equal(out.versionsJson[1]?.content, "second");
});

test("active mirrors top-level", () => {
  const v1: MessageVersion = { version: 1, content: "a", status: "completed", createdAt: "t1", model: "m1" };
  const current = { versionsJson: [v1], activeVersion: 1, content: "a", status: "completed", model: "m1" };
  const v2: MessageVersion = {
    version: 2,
    content: "b",
    status: "failed",
    createdAt: "t2",
    model: "m2",
    latencyMs: 120,
  };

  const out = appendVersion(current, v2);
  assert.equal(out.activeVersion, 2);
  assert.equal(out.content, "b");
  assert.equal(out.status, "failed");
  assert.equal(out.model, "m2");
  assert.equal(out.latencyMs, 120);
});

test("failed version retained alongside previous success", () => {
  const v1: MessageVersion = { version: 1, content: "ok", status: "completed", createdAt: "t1" };
  const current = { versionsJson: [v1], activeVersion: 1, content: "ok", status: "completed" };
  const v2: MessageVersion = { version: 2, content: "", status: "failed", createdAt: "t2", editInstruction: "regen" };

  const out = appendVersion(current, v2);
  assert.equal(out.versionsJson.length, 2);
  assert.equal(out.versionsJson[0]?.status, "completed");
  assert.equal(out.versionsJson[0]?.content, "ok");
  assert.equal(out.versionsJson[1]?.status, "failed");
});

test("cumulative tokens preserved on switch", async () => {
  const mod = await import("../../../../src/modules/chat/services/message-versioning.js");
  const activate = (mod as any).activateVersion as undefined | ((current: any, version: number) => any);
  const v1: MessageVersion = {
    version: 1,
    content: "one",
    status: "completed",
    createdAt: "t1",
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  };
  const v2: MessageVersion = {
    version: 2,
    content: "two",
    status: "completed",
    createdAt: "t2",
    usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
  };
  const after1 = appendVersion(
    { versionsJson: [], activeVersion: 0, content: "", status: "pending", inputTokens: 0, outputTokens: 0 },
    v1,
  );
  const after2 = appendVersion(after1 as any, v2);
  assert.equal(after2.inputTokens, 13);
  assert.equal(after2.outputTokens, 7);

  assert.ok(typeof activate === "function", "activateVersion export required for switch");
  const switched = activate!(after2 as any, 1);
  assert.equal(switched.activeVersion, 1);
  assert.equal(switched.content, "one");
  assert.equal(switched.inputTokens, 13);
  assert.equal(switched.outputTokens, 7);
});
