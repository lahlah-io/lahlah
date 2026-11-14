import assert from "node:assert/strict";
import { test } from "vitest";
import { extractDistrict } from "../../../../src/modules/chat/services/chat.service.js";

test("extractDistrict membaca kecamatan dari pertanyaan user", () => {
  assert.equal(extractDistrict("apa saja destinasi kuliner yang cocok di daerah padang barat?"), "Padang Barat");
  assert.equal(extractDistrict("rekomendasi pantai di Padang Selatan dong"), "Padang Selatan");
  assert.equal(extractDistrict("kuliner padang tim"), "Padang Timur");
  assert.equal(extractDistrict("wisata alam di Kec. Padang Ut."), "Padang Utara");
  assert.equal(extractDistrict("makan enak di Kuranji"), "Kuranji");
});

test("extractDistrict null bila wilayah tidak disebut", () => {
  assert.equal(extractDistrict("buat itinerary 3 hari di Padang"), null);
  assert.equal(extractDistrict("cari kuliner enak"), null);
  assert.equal(extractDistrict(""), null);
});
