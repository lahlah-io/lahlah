import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { appendLog } from "../../../src/shared/logging/file-logger.js";

test("appendLog writes one JSON line per entry", () => {
  const category = `test-${Date.now()}`;
  const file = join(process.cwd(), "log", `${category}.ndjson`);
  try {
    appendLog(category, { a: 1 });
    appendLog(category, { a: 2 });
    const lines = readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(lines.length, 2);
    assert.equal(lines[1].a, 2);
    assert.ok(lines[0].ts);
  } finally {
    rmSync(file, { force: true });
  }
});

test("appendLog routes per-session entries into a session folder", () => {
  const category = "chat";
  const sessionId = `ses-${Date.now()}`;
  const file = join(process.cwd(), "log", "session", sessionId, `${category}.ndjson`);
  try {
    appendLog(category, { kind: "classifier_error" }, sessionId);
    const line = JSON.parse(readFileSync(file, "utf8").trim());
    assert.equal(line.sessionId, sessionId);
    assert.equal(line.kind, "classifier_error");
  } finally {
    rmSync(join(process.cwd(), "log", "session", sessionId), { recursive: true, force: true });
  }
});