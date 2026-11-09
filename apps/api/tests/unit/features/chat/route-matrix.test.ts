import { describe, expect, test } from "vitest";
import { haversineMeters, isCoordinate, routeLineString } from "../../../../src/modules/chat/services/route-geometry.js";

describe("route calculation matrix", () => {
  test("ROU-001: two valid coordinates produce a distance", () => {
    const meters = haversineMeters({ latitude: -0.95, longitude: 100.35 }, { latitude: -0.94, longitude: 100.36 });
    expect(meters).not.toBeNull();
    expect(meters!).toBeGreaterThan(0);
  });

  test("ROU-002: missing coordinates skip the calculation", () => {
    expect(haversineMeters({ latitude: -0.95, longitude: 100.35 }, { latitude: null, longitude: null })).toBeNull();
    expect(routeLineString([{ latitude: -0.95, longitude: 100.35 }, { latitude: null, longitude: null }])).toBeNull();
  });

  test("ROU-003/ROU-004: invalid latitude or longitude is rejected", () => {
    expect(isCoordinate({ latitude: 91, longitude: 100.35 })).toBe(false);
    expect(isCoordinate({ latitude: -0.95, longitude: 181 })).toBe(false);
    expect(isCoordinate({ latitude: Number.NaN, longitude: 100.35 })).toBe(false);
    expect(isCoordinate({ latitude: -90, longitude: 180 })).toBe(true);
  });

  test("ROU-005: route keeps the deterministic nearest-neighbour order from the generator", () => {
    const route = routeLineString([
      { latitude: -0.95, longitude: 100.35 },
      { latitude: -0.94, longitude: 100.35 },
      { latitude: -0.93, longitude: 100.35 },
    ]);
    expect(route).toEqual({
      type: "LineString",
      coordinates: [
        [100.35, -0.95],
        [100.35, -0.94],
        [100.35, -0.93],
      ],
    });
  });

  test("ROU-006: far-apart destinations still produce a straight-line route", () => {
    const meters = haversineMeters({ latitude: -0.95, longitude: 100.35 }, { latitude: -8.65, longitude: 115.22 });
    expect(meters!).toBeGreaterThan(1_000_000);
    expect(routeLineString([{ latitude: -0.95, longitude: 100.35 }, { latitude: -8.65, longitude: 115.22 }])).not.toBeNull();
    // Feasibility of the schedule itself is evaluated by time budget only; travel time is not modelled.
  });

  test("ROU-007: output is a straight-line geometry, not a claimed road route", () => {
    const route = routeLineString([
      { latitude: -0.95, longitude: 100.35 },
      { latitude: -0.94, longitude: 100.36 },
    ])!;
    // Coordinates are exactly the input stops; no routing engine is involved.
    expect(route.coordinates).toHaveLength(2);
    expect(route.coordinates[0]).toEqual([100.35, -0.95]);
  });
});
