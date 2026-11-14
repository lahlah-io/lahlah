import assert from "node:assert/strict";
import { test } from "vitest";
import { haversineMeters } from "../../src/shared/geo/distance.js";

const padang = { latitude: -0.9471, longitude: 100.4172 };

test("haversineMeters returns 0 for identical points", () => {
  assert.equal(haversineMeters(padang, padang), 0);
});

test("haversineMeters is symmetric", () => {
  const other = { latitude: -0.9, longitude: 100.45 };
  assert.equal(
    Math.round(haversineMeters(padang, other)),
    Math.round(haversineMeters(other, padang)),
  );
});

test("haversineMeters crosses the 100 m checkpoint radius", () => {
  // ~11.1 m per 0.0001 degree of latitude.
  const inside = haversineMeters(padang, { latitude: padang.latitude + 0.0008, longitude: padang.longitude });
  const outside = haversineMeters(padang, { latitude: padang.latitude + 0.001, longitude: padang.longitude });
  assert.ok(inside < 100, `expected <100, got ${inside}`);
  assert.ok(outside > 100, `expected >100, got ${outside}`);
});
