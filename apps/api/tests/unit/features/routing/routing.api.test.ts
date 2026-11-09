import assert from "node:assert/strict";
import { test } from "vitest";
import { Hono } from "hono";
import { createRoutingApi } from "../../../../src/modules/routing/index.js";

function buildApp() {
  const api = createRoutingApi({
    getRoute: async (input: { points: Array<{ latitude: number; longitude: number }>; profile: "car" | "motorcycle" }) => ({
      source: "osrm" as const,
      distanceKm: 8.4,
      durationMin: input.profile === "motorcycle" ? 19 : 16,
      estimated: input.profile === "motorcycle",
      geometry: { type: "LineString" as const, coordinates: input.points.map((p) => [p.longitude, p.latitude] as [number, number]) },
    }),
  });
  const app = new Hono();
  app.route("/api/v1/routes", api);
  return app;
}

const points = [
  { latitude: -0.95, longitude: 100.35 },
  { latitude: -0.94, longitude: 100.36 },
];

test("POST /api/v1/routes/driving returns routed geometry", async () => {
  const res = await buildApp().request("/api/v1/routes/driving", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ points, profile: "car" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { source: string; distanceKm: number } };
  assert.equal(body.data.source, "osrm");
  assert.equal(body.data.distanceKm, 8.4);
});

test("POST /api/v1/routes/driving rejects bad payloads", async () => {
  const res = await buildApp().request("/api/v1/routes/driving", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ points: [{ latitude: 0, longitude: 0 }] }),
  });
  assert.equal(res.status, 400);
});
