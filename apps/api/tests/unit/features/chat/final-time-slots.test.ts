import { describe, expect, test } from "vitest";
import { parseGeneralTimeOfDay, resolveEffectiveRequest } from "../../../../src/modules/chat/services/chat.service.js";

describe("final time slots", () => {
  test("dini hari 00:00-05:59", () => {
    expect(parseGeneralTimeOfDay("dini hari")).toEqual({ startTime: "00:00", endTime: "05:59" });
  });

  test("pagi starts at 06:00", () => {
    expect(parseGeneralTimeOfDay("pagi")).toEqual({ startTime: "06:00", endTime: "10:59" });
  });

  test("siang ends at 14:59", () => {
    expect(parseGeneralTimeOfDay("siang")).toEqual({ startTime: "11:00", endTime: "14:59" });
  });

  test("sore ends at 17:59", () => {
    expect(parseGeneralTimeOfDay("sore")).toEqual({ startTime: "15:00", endTime: "17:59" });
  });

  test("malam ends at 23:59", () => {
    expect(parseGeneralTimeOfDay("malam")).toEqual({ startTime: "18:00", endTime: "23:59" });
  });
});

describe("default destination count", () => {
  test("defaults to 8 when date and time ready and no count given", () => {
    const outcome = resolveEffectiveRequest({
      travelDate: "2026-11-21",
      startTime: "09:00",
      endTime: "15:00",
      categories: ["kuliner"],
    });
    expect(outcome.kind).toBe("ready");
    if (outcome.kind !== "ready") return;
    expect(outcome.trip.destinationCount).toBe(8);
  });

  test("keeps explicit count", () => {
    const outcome = resolveEffectiveRequest({
      travelDate: "2026-11-21",
      startTime: "09:00",
      endTime: "15:00",
      categories: ["kuliner"],
      destinationCount: 3,
    });
    expect(outcome.kind).toBe("ready");
    if (outcome.kind !== "ready") return;
    expect(outcome.trip.destinationCount).toBe(3);
  });
});
