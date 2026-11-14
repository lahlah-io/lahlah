import assert from "node:assert/strict";
import { test } from "vitest";
import { isDeferringTime } from "../../../../src/modules/chat/services/chat.service.js";

test("isDeferringTime mengenali variasi delegasi", () => {
  for (const text of [
    "terserah",
    "terserah kamu aja",
    "kasih saran dong",
    "berikan rekomendasi",
    "aku ingin kamu tentukan saja!",
    "pilih sendiri",
    "kamu pilih aja",
    "apa aja boleh",
    "gak tau",
    "bingung",
  ]) {
    // ponytail: tanpa DB; API integrasi memverifikasi delegasi membuat trip.
    assert.equal(isDeferringTime(text), true, text);
  }
  assert.equal(isDeferringTime("buat itinerary pantai besok pagi"), false);
});
