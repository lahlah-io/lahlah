import { describe, expect, test } from "vitest";
import { generateItinerary } from "../../../../src/modules/chat/services/itinerary-generator.js";

type Candidate = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  details: unknown;
};

function candidate(id: string, lat: number | null, lng: number | null, minutes = 60): Candidate {
  return { id, name: `Dest ${id}`, latitude: lat, longitude: lng, details: { estimated_duration_minutes: minutes } };
}

function request(startTime: string, endTime: string, categories = ["pantai"]) {
  return { city: "Padang", travelDate: "2026-11-20", startTime, endTime, categories, transportMode: "walk" };
}

function minutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
}

function expectValidSchedule(result: ReturnType<typeof generateItinerary>, startTime: string, endTime: string) {
  const start = minutes(startTime);
  const end = minutes(endTime);
  let previousEnd = start;
  result.destinations.forEach((d, index) => {
    expect(d.order).toBe(index + 1);
    expect(minutes(d.startTime)).toBeGreaterThanOrEqual(previousEnd);
    expect(minutes(d.startTime)).toBeGreaterThanOrEqual(start);
    expect(minutes(d.endTime)).toBeLessThanOrEqual(end);
    expect(minutes(d.endTime)).toBeGreaterThan(minutes(d.startTime));
    previousEnd = minutes(d.endTime);
  });
}

describe("itinerary generation matrix", () => {
  test("ITI-001: 12:00-17:00 stays inside the requested window", () => {
    const result = generateItinerary(request("12:00", "17:00"), [
      candidate("a", -0.95, 100.35),
      candidate("b", -0.94, 100.35),
      candidate("c", -0.93, 100.35),
      candidate("d", -0.92, 100.35),
    ]);
    expect(result.destinations.length).toBeGreaterThan(0);
    expectValidSchedule(result, "12:00", "17:00");
  });

  test("ITI-002: 08:00-12:00 never schedules past 12:00", () => {
    const result = generateItinerary(request("08:00", "12:00"), [
      candidate("a", -0.95, 100.35),
      candidate("b", -0.94, 100.35),
      candidate("c", -0.93, 100.35),
      candidate("d", -0.92, 100.35),
    ]);
    expectValidSchedule(result, "08:00", "12:00");
    expect(result.destinations.at(-1)?.endTime).not.toBe("12:01");
  });

  test("ITI-003: 13:30-16:00 fits 150 minutes", () => {
    const result = generateItinerary(request("13:30", "16:00"), [
      candidate("a", -0.95, 100.35),
      candidate("b", -0.94, 100.35),
      candidate("c", -0.93, 100.35),
    ]);
    expectValidSchedule(result, "13:30", "16:00");
    expect(minutes(result.destinations.at(-1)!.endTime) - minutes("13:30")).toBeLessThanOrEqual(150);
  });

  test("ITI-006: a single destination still produces a realistic schedule", () => {
    const result = generateItinerary(request("09:00", "15:00"), [candidate("only", -0.95, 100.35, 90)]);
    expect(result.destinations).toHaveLength(1);
    expect(result.destinations[0]).toMatchObject({ order: 1, startTime: "09:00", endTime: "10:30" });
  });

  test("ITI-007: no candidates returns an empty result instead of inventing destinations", () => {
    const result = generateItinerary(request("09:00", "15:00"), []);
    expect(result.destinations).toEqual([]);
    expect(result.route).toBeNull();
  });

  test("ITI-008: an over-long list is truncated to the available window", () => {
    const many = Array.from({ length: 20 }, (_, i) => candidate(String(i).padStart(2, "0"), -0.95 + i * 0.001, 100.35));
    const result = generateItinerary(request("09:00", "12:00"), many);
    expect(result.destinations).toHaveLength(3);
    expectValidSchedule(result, "09:00", "12:00");
  });

  test("ITI-010: missing coordinates are null and never used to fabricate a route", () => {
    const result = generateItinerary(request("09:00", "15:00"), [
      candidate("a", null, null),
      candidate("b", null, null),
    ]);
    expect(result.destinations.map((d) => [d.latitude, d.longitude])).toEqual([
      [null, null],
      [null, null],
    ]);
    expect(result.route).toBeNull();
  });

  test("ITI-011: many candidates still respect the time budget", () => {
    const many = Array.from({ length: 12 }, (_, i) => candidate(String(i).padStart(2, "0"), -0.95, 100.35 + i * 0.001));
    const result = generateItinerary(request("10:00", "16:00"), many);
    expectValidSchedule(result, "10:00", "16:00");
    expect(result.destinations.length).toBeLessThanOrEqual(6);
  });

  test("ITI-005: requested categories are carried in the request and order is deterministic", () => {
    const candidates = [candidate("c", -0.93, 100.35), candidate("a", -0.95, 100.35), candidate("b", -0.94, 100.35)];
    const first = generateItinerary({ ...request("09:00", "15:00", ["pantai", "kuliner"]) }, candidates);
    const second = generateItinerary({ ...request("09:00", "15:00", ["pantai", "kuliner"]) }, candidates);
    expect(first.destinations.map((d) => d.id)).toEqual(second.destinations.map((d) => d.id));
    expect(first.destinations.map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  test.todo("ITI-004/ITI-009: category filtering and opening-hours checks are enforced by the search tool, not the generator; opening hours are not modelled.");
});
