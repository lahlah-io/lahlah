import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createRouteCache,
  createRoutingService,
  fallbackKm,
  routeCacheKey,
} from "../../../../src/modules/routing/index.js";

const points = [
  { latitude: -0.95, longitude: 100.35 },
  { latitude: -0.94, longitude: 100.36 },
];

const points3 = [...points, { latitude: -0.93, longitude: 100.37 }];

function osrmResponse() {
  return {
    routes: [
      {
        distance: 8400,
        duration: 960,
        geometry: { type: "LineString", coordinates: points.map((p) => [p.longitude, p.latitude]) },
      },
    ],
  };
}

function osrmLegsResponse(legs: number[]) {
  return {
    routes: [
      {
        distance: legs.reduce((a, b) => a + b, 0),
        duration: 960,
        geometry: { type: "LineString", coordinates: points3.map((p) => [p.longitude, p.latitude]) },
        legs: legs.map((distance) => ({ distance })),
      },
    ],
  };
}

function fetchOk(calls: { count: number }) {
  return (async () => {
    calls.count++;
    return new Response(JSON.stringify(osrmResponse()), { status: 200 });
  }) as typeof fetch;
}

test("routing returns OSRM result and caches the second identical lookup", async () => {
  const calls = { count: 0 };
  const service = createRoutingService({
    osrmBaseUrl: "https://router.project-osrm.org",
    timeoutMs: 8000,
    fetchFn: fetchOk(calls),
    cache: createRouteCache({ ttlMs: 3_600_000 }),
  });

  const first = await service.getRoute({ points, profile: "car" });
  assert.equal(first.source, "osrm");
  assert.equal(first.distanceKm, 8.4);
  assert.equal(first.durationMin, 16);
  assert.equal(first.estimated, false);

  const second = await service.getRoute({ points, profile: "car" });
  assert.equal(second.source, "cache");
  assert.equal(calls.count, 1);
});

test("routing scales motorcycle duration and flags it estimated", async () => {
  const calls = { count: 0 };
  const service = createRoutingService({
    osrmBaseUrl: "https://router.project-osrm.org",
    timeoutMs: 8000,
    fetchFn: fetchOk(calls),
    cache: createRouteCache({ ttlMs: 3_600_000 }),
  });

  // shortcut: factor is temporary until a real motorcycle profile is self-hosted; covered by assertion below.
  const result = await service.getRoute({ points, profile: "motorcycle" });
  assert.equal(result.source, "osrm");
  assert.equal(result.estimated, true);
  assert.equal(result.durationMin, 19);
});

test("routing falls back to straight line when OSRM is rate-limited", async () => {
  let calls = 0;
  const service = createRoutingService({
    osrmBaseUrl: "https://router.project-osrm.org",
    timeoutMs: 8000,
    fetchFn: (async () => {
      calls++;
      return new Response("slow down", { status: 429 });
    }) as typeof fetch,
    cache: createRouteCache({ ttlMs: 3_600_000 }),
  });

  const result = await service.getRoute({ points, profile: "car" });
  assert.equal(result.source, "fallback");
  assert.equal(result.durationMin, null);
  assert.equal(result.distanceKm, fallbackKm(points));
  assert.equal(result.geometry.coordinates.length, 2);
  assert.ok(calls >= 1);
});

test("routing exposes per-leg distances from OSRM legs", async () => {
  const service = createRoutingService({
    osrmBaseUrl: "https://router.project-osrm.org",
    timeoutMs: 8000,
    fetchFn: (async () => new Response(JSON.stringify(osrmLegsResponse([1200, 830])), { status: 200 })) as typeof fetch,
    cache: createRouteCache({ ttlMs: 3_600_000 }),
  });

  const result = await service.getRoute({ points: points3, profile: "car" });
  assert.equal(result.source, "osrm");
  assert.deepEqual(result.legsDistanceKm, [1.2, 0.83]);
});

test("routing leaves leg distances empty when OSRM omits legs", async () => {
  const service = createRoutingService({
    osrmBaseUrl: "https://router.project-osrm.org",
    timeoutMs: 8000,
    fetchFn: fetchOk({ count: 0 }),
    cache: createRouteCache({ ttlMs: 3_600_000 }),
  });

  const result = await service.getRoute({ points: points3, profile: "car" });
  assert.deepEqual(result.legsDistanceKm, []);
});

test("routing fallback reports straight-line distance per leg", async () => {
  const service = createRoutingService({
    osrmBaseUrl: "https://router.project-osrm.org",
    timeoutMs: 8000,
    fetchFn: (async () => new Response("slow down", { status: 429 })) as typeof fetch,
    cache: createRouteCache({ ttlMs: 3_600_000 }),
  });

  const result = await service.getRoute({ points: points3, profile: "car" });
  assert.equal(result.source, "fallback");
  assert.equal(result.legsDistanceKm.length, 2);
  const total = result.legsDistanceKm.reduce((a, b) => a + b, 0);
  // fallbackKm rounds the total to 1 decimal, so allow that rounding slack.
  assert.ok(Math.abs(total - fallbackKm(points3)) < 0.1);
});

test("routing cache key rounds coordinates to 5 decimals", () => {
  const a = routeCacheKey("car", [{ latitude: -0.95000001, longitude: 100.35000001 }]);
  const b = routeCacheKey("car", [{ latitude: -0.95, longitude: 100.35 }]);
  assert.equal(a, b);
});

test("routing rejects invalid payloads at the schema boundary", async () => {
  const { routeRequestSchema } = await import("../../../../src/modules/routing/schemas/routing.schema.js");
  assert.equal(routeRequestSchema.safeParse({ points: [{ latitude: 0, longitude: 0 }], profile: "car" }).success, false);
  assert.equal(
    routeRequestSchema.safeParse({ points, profile: "bicycle" }).success,
    false,
  );
  assert.equal(routeRequestSchema.parse({ points }).profile, "car");
  assert.equal(routeRequestSchema.parse({ points, profile: "foot" }).profile, "foot");
});
