import assert from "node:assert/strict";
import test from "node:test";
import { resolveCategories } from "../../../src/scripts/destinations/categories.js";

test("satu tag bisa menghasilkan beberapa kategori", () => {
  assert.deepEqual(resolveCategories(["natural.beach"]), ["pantai", "alam", "santai"]);
});

test("tag historic apa pun masuk sejarah", () => {
  assert.deepEqual(resolveCategories(["historic=fort"]), ["sejarah"]);
});

test("tag tak dikenal jatuh ke alam", () => {
  assert.deepEqual(resolveCategories(["unknown.tag"]), ["alam"]);
});

test("kategori yang sama tidak dobel", () => {
  assert.deepEqual(resolveCategories(["natural.beach", "natural=beach"]), [
    "pantai",
    "alam",
    "santai",
  ]);
});
