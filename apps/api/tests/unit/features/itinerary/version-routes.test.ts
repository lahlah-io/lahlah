import assert from "node:assert/strict";
import { test } from "vitest";
import { deriveVersionRoutes } from "../../../../src/modules/itinerary/services/version-routes.js";

test("deriveVersionRoutes maps persisted route legs to itinerary stop IDs without changing geometry/source", () => {
  const routes = deriveVersionRoutes(
    {
      legs: [
        {
          fromPosition: 1,
          toPosition: 2,
          transportMode: "walk",
          distanceM: 1200,
          durationSec: null,
          geometry: { type: "LineString", coordinates: [[100.35, -0.95], [100.36, -0.94]] },
          provider: "straight_line",
          profile: "straight_line",
          fallback: true,
        },
      ],
    },
    [
      { id: "stop-1", position: 1 },
      { id: "stop-2", position: 2 },
    ],
  );

  assert.deepEqual(routes, [
    {
      fromStopId: "stop-1",
      toStopId: "stop-2",
      transportMode: "walk",
      geometryJson: { type: "LineString", coordinates: [[100.35, -0.95], [100.36, -0.94]] },
      provider: "straight_line",
      providerProfile: "straight_line",
      fallback: true,
    },
  ]);
});

test("deriveVersionRoutes skips route legs without matching stops", () => {
  const routes = deriveVersionRoutes(
    { legs: [{ fromPosition: 1, toPosition: 2, fallback: true }] },
    [{ id: "stop-1", position: 1 }],
  );

  assert.deepEqual(routes, []);
});
