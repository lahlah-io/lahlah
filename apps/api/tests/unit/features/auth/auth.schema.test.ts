import assert from "node:assert/strict";
import test from "node:test";
import { exchangePidCodeSchema } from "../../../../src/modules/auth/schemas/auth.schema.js";

test("exchange menerima kode dan codeVerifier opsional", () => {
  assert.deepEqual(exchangePidCodeSchema.parse({ code: "abc" }), { code: "abc" });
  assert.deepEqual(exchangePidCodeSchema.parse({ code: "abc", codeVerifier: "verifier" }), {
    code: "abc",
    codeVerifier: "verifier",
  });
});

test("exchange menolak kode kosong atau terlalu panjang", () => {
  assert.equal(exchangePidCodeSchema.safeParse({ code: "   " }).success, false);
  assert.equal(exchangePidCodeSchema.safeParse({ code: "x".repeat(2049) }).success, false);
  assert.equal(exchangePidCodeSchema.safeParse({}).success, false);
});
