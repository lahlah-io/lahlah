import assert from "node:assert/strict";
import { test } from "vitest";

type TripRequest = {
  city: "Padang";
  travelDate: string;
  startTime: string;
  endTime: string;
  categories: string[];
  transportMode: "walk" | "car" | "motorcycle";
};

type CandidateDestination = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  details: unknown;
};

type ItineraryGenerator = {
  generateItinerary: (req: unknown, candidates: unknown) => unknown;
};

async function loadGenerator(): Promise<ItineraryGenerator> {
  const mod = await import("../../../../src/modules/chat/services/itinerary-generator.js");
  return mod as unknown as ItineraryGenerator;
}

const baseReq: TripRequest = {
  city: "Padang",
  travelDate: "2026-11-15",
  startTime: "09:00",
  endTime: "15:00",
  categories: [],
  transportMode: "walk",
};

const candidates: CandidateDestination[] = [
  { id: "a", name: "Alpha", latitude: -0.95, longitude: 100.35, details: { estimated_duration_minutes: 60 } },
  { id: "b", name: "Beta", latitude: -0.94, longitude: 100.35, details: { estimated_duration_minutes: 60 } },
  { id: "c", name: "Charlie", latitude: -0.93, longitude: 100.35, details: { estimated_duration_minutes: 60 } },
];

const tenCandidates: CandidateDestination[] = Array.from({ length: 10 }, (_, i) => ({
  id: `t${i}`,
  name: `T${i}`,
  latitude: -0.95 + i * 0.001,
  longitude: 100.35,
  details: { estimated_duration_minutes: 60 },
}));

async function expect422(fn: () => unknown, code: string) {
  try {
    await fn();
    assert.fail("expected HttpError");
  } catch (err) {
    const e = err as { status?: number; code?: string };
    assert.equal(e?.status, 422);
    assert.equal(e?.code, code);
  }
}

test("rejects invalid travel date", async () => {
  const { generateItinerary } = await loadGenerator();
  await expect422(() => generateItinerary({ ...baseReq, travelDate: "2026-02-30" }, candidates), "ITINERARY_REQUEST_INVALID");
  await expect422(() => generateItinerary({ ...baseReq, travelDate: "not-a-date" }, candidates), "ITINERARY_REQUEST_INVALID");
});

test("rejects when end time is before start time", async () => {
  const { generateItinerary } = await loadGenerator();
  await expect422(() => generateItinerary({ ...baseReq, startTime: "15:00", endTime: "09:00" }, candidates), "ITINERARY_REQUEST_INVALID");
});

test("rejects when end time equals start time", async () => {
  const { generateItinerary } = await loadGenerator();
  await expect422(() => generateItinerary({ ...baseReq, startTime: "09:00", endTime: "09:00" }, candidates), "ITINERARY_REQUEST_INVALID");
});

test("accepts same-day travel date and builds schedule within range", async () => {
  const { generateItinerary } = await loadGenerator();
  const result = generateItinerary(baseReq, candidates) as {
    destinations: Array<{ id: string; order: number; startTime: string; endTime: string }>;
    travelDate: string;
  };
  assert.equal(result.travelDate, "2026-11-15");
  assert.ok(result.destinations.length >= 1);
  for (const d of result.destinations) {
    assert.ok(d.startTime >= baseReq.startTime);
    assert.ok(d.endTime <= baseReq.endTime);
  }
});

test("greedy nearest-neighbor is deterministic and stable on tie", async () => {
  const { generateItinerary } = await loadGenerator();
  // a and b are equidistant vertically? place start implicitly at first candidate; b and c form a line.
  // Tie-break by id ascending for stability.
  const tied: CandidateDestination[] = [
    { id: "z", name: "Zed", latitude: 0, longitude: 0, details: { estimated_duration_minutes: 30 } },
    { id: "m", name: "Mid", latitude: 0, longitude: 1, details: { estimated_duration_minutes: 30 } },
    { id: "a", name: "Aaa", latitude: 0, longitude: -1, details: { estimated_duration_minutes: 30 } },
  ];
  const r1 = generateItinerary({ ...baseReq, startTime: "09:00", endTime: "12:00" }, tied) as { destinations: Array<{ id: string; order: number }> };
  const r2 = generateItinerary({ ...baseReq, startTime: "09:00", endTime: "12:00" }, tied) as { destinations: Array<{ id: string; order: number }> };
  assert.deepEqual(r1.destinations.map((d) => d.id), r2.destinations.map((d) => d.id));
  // Start at lexicographically first by id among valid? deterministic: starts at candidate with smallest id, then NN with id tie-break.
  assert.equal(r1.destinations[0].id, "a");
  assert.deepEqual(r1.destinations.map((d) => d.order), [1, 2, 3]);
});

test("schedule keeps stops that start inside the window and reports the real end", async () => {
  const { generateItinerary } = await loadGenerator();
  const many: CandidateDestination[] = Array.from({ length: 10 }, (_, i) => ({
    id: `d${i}`,
    name: `D${i}`,
    latitude: -0.95 + i * 0.001,
    longitude: 100.35,
    details: { estimated_duration_minutes: 90 },
  }));
  const result = generateItinerary({ ...baseReq, startTime: "09:00", endTime: "11:00" }, many) as {
    destinations: Array<{ startTime: string; endTime: string }>;
    endTime: string;
    actualCount: number;
  };
  // 09:00 and 10:30 both start before 11:00; the second ends at 12:00 (reported).
  assert.equal(result.destinations.length, 2);
  assert.equal(result.endTime, "12:00");
  assert.equal(result.actualCount, 2);
  for (const d of result.destinations) assert.ok(d.startTime < "11:00");
});

test("returned destinations are only from candidates DB", async () => {
  const { generateItinerary } = await loadGenerator();
  const result = generateItinerary(baseReq, candidates) as { destinations: Array<{ id: string }> };
  const allowed = new Set(candidates.map((c) => c.id));
  for (const d of result.destinations) assert.ok(allowed.has(d.id), `unexpected id ${d.id}`);
});

test("GeoJSON route uses [longitude, latitude] order", async () => {
  const { generateItinerary } = await loadGenerator();
  const result = generateItinerary(baseReq, candidates) as { route: { type: string; coordinates: number[][] } | null };
  assert.ok(result.route);
  assert.equal(result.route.type, "LineString");
  for (const coord of result.route.coordinates) {
    assert.equal(coord.length, 2);
    // longitude in Indonesia ~100, latitude ~ -1
    assert.ok(coord[0] > 90 && coord[0] < 150, `coord[0] should be longitude, got ${coord[0]}`);
    assert.ok(coord[1] > -15 && coord[1] < 15, `coord[1] should be latitude, got ${coord[1]}`);
  }
});

test("route is null when fewer than two valid coordinate points", async () => {
  const { generateItinerary } = await loadGenerator();
  const noCoords: CandidateDestination[] = [
    { id: "x", name: "X", latitude: null, longitude: null, details: { estimated_duration_minutes: 30 } },
    { id: "y", name: "Y", latitude: 999, longitude: 100, details: { estimated_duration_minutes: 30 } },
  ];
  const result = generateItinerary({ ...baseReq, startTime: "09:00", endTime: "12:00" }, noCoords) as { route: unknown };
  assert.equal(result.route, null);
});

test("destinationCount caps output before scheduling", async () => {
  const { generateItinerary } = await loadGenerator();
  const wide = { ...baseReq, startTime: "08:00", endTime: "20:00" };
  const r3 = generateItinerary({ ...wide, destinationCount: 3 }, tenCandidates) as { destinations: Array<{ id: string }> };
  assert.equal(r3.destinations.length, 3);
  const r5ins = generateItinerary({ ...wide, destinationCount: 5 }, candidates) as { destinations: Array<{ id: string }> };
  assert.equal(r5ins.destinations.length, 3);
  const r5 = generateItinerary({ ...wide, destinationCount: 5 }, tenCandidates) as { destinations: Array<{ id: string }> };
  assert.equal(r5.destinations.length, 5);
  assert.equal(new Set(r5.destinations.map((d) => d.id)).size, 5);
  const r1 = generateItinerary({ ...wide, destinationCount: 1 }, tenCandidates) as { destinations: Array<{ id: string }> };
  assert.equal(r1.destinations.length, 1);
});

test("no destinationCount takes candidates until the window is full", async () => {
  const { generateItinerary } = await loadGenerator();
  const result = generateItinerary({ ...baseReq, startTime: "08:00", endTime: "20:00" }, tenCandidates) as {
    destinations: Array<{ endTime: string }>;
    requestedCount: number | null;
    actualCount: number;
  };
  assert.equal(result.destinations.length, 10);
  assert.equal(result.requestedCount, null);
  assert.equal(result.actualCount, 10);
});

test("explicit count is honored even when it runs past the window", async () => {
  const { generateItinerary } = await loadGenerator();
  const result = generateItinerary(
    { ...baseReq, startTime: "15:00", endTime: "17:59", destinationCount: 3 },
    candidates,
  ) as { destinations: unknown[]; endTime: string; requestedCount: number; actualCount: number };
  assert.equal(result.destinations.length, 3);
  assert.equal(result.endTime, "18:00");
  assert.equal(result.requestedCount, 3);
  assert.equal(result.actualCount, 3);
});

test("actualCount reports a candidate shortage", async () => {
  const { generateItinerary } = await loadGenerator();
  const result = generateItinerary(
    { ...baseReq, startTime: "08:00", endTime: "20:00", destinationCount: 5 },
    candidates,
  ) as { destinations: unknown[]; requestedCount: number; actualCount: number };
  assert.equal(result.requestedCount, 5);
  assert.equal(result.actualCount, 3);
});

test("requested categories are all represented without meal domination", async () => {
  const { generateItinerary } = await loadGenerator();
  const mixed: CandidateDestination[] = [
    { id: "p1", name: "P1", latitude: -0.9, longitude: 100.35, details: {}, categories: ["pantai"] },
    { id: "p2", name: "P2", latitude: -0.9, longitude: 100.351, details: {}, categories: ["pantai"] },
    { id: "p3", name: "P3", latitude: -0.9, longitude: 100.352, details: {}, categories: ["pantai"] },
    { id: "k1", name: "K1", latitude: -0.9, longitude: 100.353, details: {}, categories: ["kuliner"] },
  ];
  const result = generateItinerary({ ...baseReq, startTime: "09:00", endTime: "13:00", categories: ["pantai", "kuliner"] }, mixed) as {
    destinations: Array<{ id: string }>;
  };
  // Order is by proximity now; membership carries the balance guarantee.
  assert.deepEqual(result.destinations.map((d) => d.id).sort(), ["k1", "p1", "p2", "p3"]);
});

test("a mixed day never becomes mostly restaurants", async () => {
  const { generateItinerary } = await loadGenerator();
  const mixed: CandidateDestination[] = [
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`, name: `Pantai ${i}`, latitude: -0.9, longitude: 100.35 + i * 0.001, details: {}, categories: ["pantai"],
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `k${i}`, name: `Kuliner ${i}`, latitude: -0.9, longitude: 100.36 + i * 0.001, details: {}, categories: ["kuliner"],
    })),
  ];
  const result = generateItinerary(
    { ...baseReq, startTime: "08:00", endTime: "20:00", destinationCount: 10, categories: ["pantai", "kuliner"] },
    mixed,
  ) as { destinations: Array<{ id: string }> };
  const meals = result.destinations.filter((d) => d.id.startsWith("k")).length;
  assert.ok(meals <= 2, `expected at most 2 kuliner stops, got ${meals}`);
  assert.ok(result.destinations.length > meals);
});

test("an island gets its own day instead of joining a crowded walk", async () => {
  const { generateItinerary } = await loadGenerator();
  const withIsland: CandidateDestination[] = [
    { id: "a", name: "Pantai A", latitude: -0.9, longitude: 100.35, details: {}, categories: ["pantai"] },
    { id: "b", name: "Pulau Pasumpahan", latitude: -1.0, longitude: 100.4, details: {}, categories: ["pantai"] },
    { id: "c", name: "Pantai C", latitude: -0.91, longitude: 100.36, details: {}, categories: ["pantai"] },
  ];
  const result = generateItinerary({ ...baseReq, startTime: "08:00", endTime: "20:00" }, withIsland) as {
    destinations: Array<{ name: string }>;
  };
  assert.ok(result.destinations.every((d) => !/pulau/i.test(d.name)), "island dropped from a multi-stop day");
});

test("destinationCount zero or non-integer is rejected", async () => {
  const { generateItinerary } = await loadGenerator();
  await expect422(() => generateItinerary({ ...baseReq, destinationCount: 0 }, candidates), "ITINERARY_REQUEST_INVALID");
  await expect422(() => generateItinerary({ ...baseReq, destinationCount: 1.5 }, candidates), "ITINERARY_REQUEST_INVALID");
});