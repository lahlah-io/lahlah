import assert from "node:assert/strict";
import { test } from "vitest";
import { buildDestinationChunk, findRelevantChunks } from "../../../../src/modules/chat/services/rag.js";

test("buildDestinationChunk joins name, categories, address, description, details", () => {
  const chunk = buildDestinationChunk({
    id: "d1",
    name: "Pantai Air Manis",
    description: "Pantai dengan batu Malin Kundang",
    address: "Padang Selatan",
    categories: [{ name: "Pantai" }, { name: "Alam" }],
    details: { price: 10000 },
  });
  assert.ok(chunk.includes("Pantai Air Manis"));
  assert.ok(chunk.includes("Kategori: Pantai, Alam"));
  assert.ok(chunk.includes("Alamat: Padang Selatan"));
  assert.ok(chunk.includes("Deskripsi: Pantai dengan batu Malin Kundang"));
  assert.ok(chunk.includes('"price":10000'));
});

test("buildDestinationChunk omits empty fields", () => {
  const chunk = buildDestinationChunk({ id: "d2", name: "Sate Padang" });
  assert.equal(chunk, "Sate Padang");
});

test("findRelevantChunks returns top-K above threshold", () => {
  const kb = [
    { text: "a", embedding: [1, 0], destinationId: "1", name: "A" },
    { text: "b", embedding: [0, 1], destinationId: "2", name: "B" },
    { text: "c", embedding: [0.707, 0.707], destinationId: "3", name: "C" },
  ];
  const hits = findRelevantChunks([1, 0], kb, 2, 0.5);
  assert.deepEqual(hits.map((h) => h.name), ["A", "C"]);
});

test("findRelevantChunks returns no context when no result passes threshold", () => {
  const kb = [
    { text: "a", embedding: [1, 0], destinationId: "1", name: "A" },
    { text: "b", embedding: [0, 1], destinationId: "2", name: "B" },
  ];
  const hits = findRelevantChunks([0.9, 0.9], kb, 3, 0.99);
  assert.deepEqual(hits, []);
});
