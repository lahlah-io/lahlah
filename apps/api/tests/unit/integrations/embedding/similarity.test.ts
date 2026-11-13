import assert from "node:assert/strict";
import { test } from "vitest";
import { cosineSimilarity } from "../../../../src/integrations/embedding/similarity.js";

test("identical vectors score 1", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
});

test("orthogonal vectors score 0", () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("known angle returns expected cosine", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0.707, 0.707]) - 0.707) < 0.01);
});

test("zero vector returns 0 instead of NaN", () => {
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});
