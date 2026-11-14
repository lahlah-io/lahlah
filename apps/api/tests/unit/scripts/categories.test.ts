import assert from "node:assert/strict";
import test from "node:test";
import { resolveCategories } from "../../../src/scripts/destinations/categories.js";

test("satu tag bisa menghasilkan beberapa kategori", () => {
  assert.deepEqual(resolveCategories(["natural.beach"]), ["pantai", "alam", "santai"]);
});

test("tag historic apa pun masuk sejarah", () => {
  assert.deepEqual(resolveCategories(["historic=fort"]), ["sejarah"]);
});

// RS/sekolah/masjid dulu masuk "alam" lewat fallback ini; tag tak dikenal sekarang tanpa kategori.
test("tag tak dikenal tidak diberi kategori", () => {
  assert.deepEqual(resolveCategories(["unknown.tag"]), []);
});

test("kategori yang sama tidak dobel", () => {
  assert.deepEqual(resolveCategories(["natural.beach", "natural=beach"]), [
    "pantai",
    "alam",
    "santai",
  ]);
});
