import assert from "node:assert/strict";
import test from "node:test";
import {
  distanceMeters,
  nameSimilarity,
  pickSurvivor,
  shouldMergeDuplicate,
  type DedupeCandidate,
} from "../../../src/scripts/destinations/dedupe.js";

function candidate(overrides: Partial<DedupeCandidate>): DedupeCandidate {
  return {
    id: "a",
    canonicalKey: "pantai air manis",
    name: "Pantai Air Manis",
    description: null,
    address: null,
    latitude: -1.0,
    longitude: 100.4,
    imageUrl: null,
    source: "geoapify",
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

test("distanceMeters menghitung jarak kasar", () => {
  const meters = distanceMeters(-0.9471, 100.4172, -0.9481, 100.4172);
  assert.ok(meters > 100 && meters < 120);
});

test("nameSimilarity naik untuk nama mirip", () => {
  assert.ok(nameSimilarity("pantai air manis", "air manis beach") >= 0.3);
  assert.ok(nameSimilarity("pantai air manis", "danau toba") < 0.3);
});

test("dua nama mirip dalam 150 m digabung", () => {
  assert.equal(
    shouldMergeDuplicate(
      candidate({ id: "a", canonicalKey: "pantai air manis" }),
      candidate({
        id: "b",
        canonicalKey: "air manis beach",
        name: "Air Manis Beach",
        latitude: -1.0006,
      }),
    ),
    true,
  );
});

test("jarak jauh tidak digabung", () => {
  assert.equal(
    shouldMergeDuplicate(
      candidate({ id: "a" }),
      candidate({ id: "b", canonicalKey: "pantai air manis dua", latitude: -2.0 }),
    ),
    false,
  );
});

test("tanpa koordinat tidak digabung", () => {
  assert.equal(
    shouldMergeDuplicate(
      candidate({ id: "a", latitude: null }),
      candidate({ id: "b", canonicalKey: "air manis beach", latitude: null }),
    ),
    false,
  );
});

test("nama yang merupakan bagian nama lain tidak digabung", () => {
  assert.equal(
    shouldMergeDuplicate(
      candidate({ id: "a", canonicalKey: "pantai padang", name: "Pantai Padang" }),
      candidate({
        id: "b",
        canonicalKey: "pantai padang selatan",
        name: "Pantai Padang Selatan",
        latitude: -0.9476,
      }),
    ),
    false,
  );
});

test("pickSurvivor memilih data terlengkap", () => {
  const result = pickSurvivor(
    candidate({ id: "a" }),
    candidate({ id: "b", description: "Ada deskripsi", address: "Jl. Air Manis" }),
  );
  assert.equal(result.survivor.id, "b");
});

test("pickSurvivor memakai prioritas sumber saat kelengkapan sama", () => {
  const result = pickSurvivor(
    candidate({ id: "a", source: "manual" }),
    candidate({ id: "b", source: "geoapify" }),
  );
  assert.equal(result.survivor.id, "b");
});

test("pickSurvivor memilih yang lebih lama saat prioritas sama", () => {
  const result = pickSurvivor(
    candidate({ id: "lama", createdAt: new Date("2026-01-01") }),
    candidate({ id: "baru", createdAt: new Date("2026-02-01") }),
  );
  assert.equal(result.survivor.id, "lama");
});
