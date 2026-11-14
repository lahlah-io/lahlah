import assert from "node:assert/strict";
import { test } from "vitest";
import { tripLegDistancesM, type TripRouteFn } from "../../../../src/shared/geo/trip-distance.js";

const points = [
  { latitude: -0.95, longitude: 100.35 },
  { latitude: -0.94, longitude: 100.36 },
  { latitude: -0.93, longitude: 100.37 },
];

function routeFn(result: { source: string; legsDistanceKm: number[] }): TripRouteFn {
  return async () => result;
}

test("trip leg distances convert road km to whole meters", async () => {
  const legs = await tripLegDistancesM(points, routeFn({ source: "osrm", legsDistanceKm: [1.2, 0.8349] }));
  assert.deepEqual(legs, [1200, 835]);
});

test("trip leg distances are null when a stop has no coordinate", async () => {
  const legs = await tripLegDistancesM([points[0]!, null, points[2]!], routeFn({ source: "osrm", legsDistanceKm: [1, 1] }));
  assert.equal(legs, null);
});

test("trip leg distances are null when routing falls back to a straight line", async () => {
  const legs = await tripLegDistancesM(points, routeFn({ source: "fallback", legsDistanceKm: [1.2, 0.8] }));
  assert.equal(legs, null);
});

test("trip leg distances are null when leg count does not match the stops", async () => {
  const legs = await tripLegDistancesM(points, routeFn({ source: "osrm", legsDistanceKm: [1.2] }));
  assert.equal(legs, null);
});
