import assert from "node:assert/strict";
import { test } from "vitest";
import { hashToken, randomToken } from "../../../../src/shared/auth/tokens.js";

test("token sesi acak, panjang, dan unik", () => {
  const first = randomToken();
  const second = randomToken();
  assert.equal(typeof first, "string");
  assert.ok(first.length >= 40);
  assert.notEqual(first, second);
});

test("hash token deterministik untuk pepper yang sama", () => {
  const token = randomToken();
  const hash = hashToken(token, "pepper-yang-cukup-panjang");
  assert.equal(hash.length, 64);
  assert.equal(hash, hashToken(token, "pepper-yang-cukup-panjang"));
  assert.notEqual(hash, hashToken(token, "pepper-lain-yang-cukup-panjang"));
  assert.notEqual(hash, hashToken(randomToken(), "pepper-yang-cukup-panjang"));
});
