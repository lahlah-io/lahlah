import assert from "node:assert/strict";
import test from "node:test";

type RouteGeometry = {
  isValidCoordinate: (lat: unknown, lng: unknown) => boolean;
  haversineMeters: (a: unknown, b: unknown) => number | null;
  routeLineString: (points: unknown[]) => unknown;
};

async function loadRouteGeometry(): Promise<RouteGeometry> {
  const mod = await import("../../../../src/modules/chat/services/route-geometry.js");
  return mod as unknown as RouteGeometry;
}

// Padang city center-ish and a nearby point (~1 degree lat is ~111 km).
const PADANG = { latitude: -0.95, longitude: 100.35 };
const NEARBY = { latitude: -0.94, longitude: 100.35 };

test("isValidCoordinate accepts only in-range latitude/longitude", async () => {
  const { isValidCoordinate } = await loadRouteGeometry();
  assert.equal(isValidCoordinate(-0.95, 100.35), true);
  assert.equal(isValidCoordinate(91, 0), false);
  assert.equal(isValidCoordinate(-91, 0), false);
  assert.equal(isValidCoordinate(0, 181), false);
  assert.equal(isValidCoordinate(0, -181), false);
  assert.equal(isValidCoordinate(0, 180), true);
  assert.equal(isValidCoordinate(null, 100), false);
  assert.equal(isValidCoordinate(0, null), false);
  assert.equal(isValidCoordinate("x", 100), false);
});

test("haversineMeters returns straight-line distance in meters", async () => {
  const { haversineMeters } = await loadRouteGeometry();
  // One degree of latitude ≈ 111,195 m.
  const m = haversineMeters({ latitude: 0, longitude: 100 }, { latitude: 1, longitude: 100 });
  assert.ok(typeof m === "number");
  assert.ok(Math.abs(m - 111_195) < 2_000, `expected ~111195, got ${m}`);
});

test("haversineMeters returns null when a coordinate is invalid", async () => {
  const { haversineMeters } = await loadRouteGeometry();
  assert.equal(haversineMeters(PADANG, { latitude: null, longitude: 100.35 }), null);
  assert.equal(haversineMeters(PADANG, { latitude: 0, longitude: 999 }), null);
});

test("route coordinates use [longitude, latitude] order", async () => {
  const { routeLineString } = await loadRouteGeometry();
  const route = routeLineString([PADANG, NEARBY]) as { type: string; coordinates: number[][] };
  assert.equal(route.type, "LineString");
  assert.equal(route.coordinates[0][0], PADANG.longitude);
  assert.equal(route.coordinates[0][1], PADANG.latitude);
  assert.equal(route.coordinates[1][0], NEARBY.longitude);
  assert.equal(route.coordinates[1][1], NEARBY.latitude);
});

test("route is null when fewer than two valid points", async () => {
  const { routeLineString } = await loadRouteGeometry();
  assert.equal(routeLineString([]), null);
  assert.equal(routeLineString([PADANG]), null);
  assert.equal(routeLineString([{ latitude: null, longitude: null }, { latitude: 99, longitude: 100 }]), null);
});

test("route drops points with invalid coordinates", async () => {
  const { routeLineString } = await loadRouteGeometry();
  const route = routeLineString([
    PADANG,
    { latitude: null, longitude: 100.35 },
    NEARBY,
    { latitude: 200, longitude: 100 },
  ]) as { type: string; coordinates: number[][] };
  assert.equal(route.coordinates.length, 2);
  assert.deepEqual(route.coordinates, [
    [100.35, -0.95],
    [100.35, -0.94],
  ]);
});