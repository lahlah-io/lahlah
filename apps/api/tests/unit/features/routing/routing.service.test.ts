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
});
