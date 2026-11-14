import assert from "node:assert/strict";
import { test } from "vitest";
import { buildDestinationChunk, findRelevantChunks } from "../../../../src/modules/chat/services/rag.js";

test("buildDestinationChunk joins name, categories, address, description, details", () => {
  const chunk = buildDestinationChunk({
    id: "d1",
    name: "Pantai Air Manis",
    description: "Pantai dengan batu Malin Kundang",
    address: "Padang Selatan",
    district: "Padang Selatan",
    categories: [{ name: "Pantai" }, { name: "Alam" }],
    details: { price: 10000 },
  });
  assert.ok(chunk.includes("Pantai Air Manis"));
  assert.ok(chunk.includes("Kategori: Pantai, Alam"));
  assert.ok(chunk.includes("Wilayah: Padang Selatan"));
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
    { text: "a", embedding: [1, 0], destinationId: "1", name: "A", categorySlugs: [] },
    { text: "b", embedding: [0, 1], destinationId: "2", name: "B", categorySlugs: [] },
    { text: "c", embedding: [0.707, 0.707], destinationId: "3", name: "C", categorySlugs: [] },
  ];
  const hits = findRelevantChunks([1, 0], kb, 2, 0.5);
  assert.deepEqual(hits.map((h) => h.name), ["A", "C"]);
});

test("findRelevantChunks keeps the single best hit when it clears the fallback floor", () => {
  const kb = [
    { text: "a", embedding: [1, 0, 0], destinationId: "1", name: "A", categorySlugs: [] },
    { text: "b", embedding: [0, 1, 0], destinationId: "2", name: "B", categorySlugs: [] },
    { text: "c", embedding: [0, 0.9, 0.1], destinationId: "3", name: "C", categorySlugs: [] },
  ];
  // Skor terbaik ~0.857: di bawah threshold 0.95, tapi di atas fallbackMin 0.2.
  const hits = findRelevantChunks([1, 0.6, 0], kb, 3, 0.95, [], 0.2);
  assert.deepEqual(hits.map((h) => h.name), ["A"]);
});

test("findRelevantChunks stays empty below the fallback floor (off-topic queries)", () => {
  const kb = [
    { text: "a", embedding: [1, 0, 0], destinationId: "1", name: "A", categorySlugs: [] },
    { text: "b", embedding: [0, 1, 0], destinationId: "2", name: "B", categorySlugs: [] },
  ];
  // Skor terbaik ~0.148, di bawah fallbackMin 0.2: konteks kosong, bukan mengarang.
  const hits = findRelevantChunks([0.15, 0, 1], kb, 3, 0.3, [], 0.2);
  assert.deepEqual(hits, []);
});

test("findRelevantChunks scopes candidates to the requested categories", () => {
  const kb = [
    { text: "pantai", embedding: [1, 0], destinationId: "1", name: "Pantai A", categorySlugs: ["pantai"] },
    { text: "museum", embedding: [1, 0.01], destinationId: "2", name: "Museum B", categorySlugs: ["sejarah"] },
  ];
  const hits = findRelevantChunks([1, 0], kb, 3, 0.5, ["sejarah"], 0.2);
  assert.deepEqual(hits.map((h) => h.name), ["Museum B"]);
});

test("findRelevantChunks matches any of several requested categories", () => {
  const kb = [
    { text: "pantai", embedding: [1, 0], destinationId: "1", name: "Pantai A", categorySlugs: ["pantai"] },
    { text: "museum", embedding: [0.9, 0.1], destinationId: "2", name: "Museum B", categorySlugs: ["sejarah"] },
    { text: "kopi", embedding: [1, 0], destinationId: "3", name: "Kopi C", categorySlugs: ["kuliner"] },
  ];
  const hits = findRelevantChunks([1, 0], kb, 1, 0.5, ["sejarah", "kuliner"], 0.2);
  assert.deepEqual(hits.map((h) => h.name), ["Kopi C"]);
});

test("findRelevantChunks falls back to the whole knowledge base when the scope is empty", () => {
  const kb = [
    { text: "pantai", embedding: [1, 0], destinationId: "1", name: "Pantai A", categorySlugs: ["pantai"] },
  ];
  // Tidak ada destinasi "keluarga" di KB; query tidak boleh menjadi kosong hanya karena scope kosong.
  const hits = findRelevantChunks([1, 0], kb, 3, 0.5, ["keluarga"], 0.2);
  assert.deepEqual(hits.map((h) => h.name), ["Pantai A"]);
});

test("findRelevantChunks excludes rejected categories, including from the fallback", () => {
  const kb = [
    { text: "museum", embedding: [1, 0], destinationId: "1", name: "Museum A", categorySlugs: ["sejarah"] },
    { text: "pantai", embedding: [0, 1], destinationId: "2", name: "Pantai B", categorySlugs: ["pantai"] },
  ];
  // Museum paling mirip tapi ditolak; pantai jauh di bawah threshold, jadi hasilnya kosong.
  assert.deepEqual(findRelevantChunks([1, 0], kb, 3, 0.3, [], 0.2, ["sejarah"]), []);
  // Alternatif yang relevan tetap boleh muncul.
  const hits = findRelevantChunks([1, 0.9], kb, 3, 0.3, [], 0.2, ["sejarah"]);
  assert.deepEqual(hits.map((h) => h.name), ["Pantai B"]);
});

test("findRelevantChunks excludes specific rejected destinations while preserving the category", () => {
  const kb = [
    { text: "pantai air manis", embedding: [1, 0], destinationId: "1", name: "Pantai Air Manis", categorySlugs: ["pantai"] },
    { text: "pantai padang", embedding: [0.95, 0.05], destinationId: "2", name: "Pantai Padang", categorySlugs: ["pantai"] },
  ];
  const hits = findRelevantChunks([1, 0], kb, 3, 0.3, ["pantai"], 0.2, [], ["Pantai Air Manis"]);
  assert.deepEqual(hits.map((h) => h.name), ["Pantai Padang"]);
});

test("buildDestinationChunk enriches shopping and relaxation categories with keywords", () => {
  const belanjaChunk = buildDestinationChunk({
    name: "Toko Sanjai",
    categories: [{ name: "Belanja", slug: "belanja" }],
  });
  assert(belanjaChunk.includes("oleh-oleh, oleh2"));

  const santaiChunk = buildDestinationChunk({
    name: "Kafe Sunset",
    categories: [{ name: "Santai", slug: "santai" }],
  });
  assert(santaiChunk.includes("nongkrong, sore, tepi laut, ngopi, santai keluarga"));
});
