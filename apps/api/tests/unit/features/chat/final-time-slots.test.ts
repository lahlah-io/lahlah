import { describe, expect, test } from "vitest";
import { parseFullDay, parseGeneralTimeOfDay, parseTimeChange, resolveEffectiveRequest } from "../../../../src/modules/chat/services/chat.service.js";

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
  test("no count leaves destinationCount unset so the scheduler decides", () => {
    const outcome = resolveEffectiveRequest({
      travelDate: "2026-11-21",
      startTime: "09:00",
      endTime: "15:00",
      categories: ["seed-kuliner"],
    });
    expect(outcome.kind).toBe("ready");
    if (outcome.kind !== "ready") return;
    expect(outcome.trip.destinationCount).toBeUndefined();
  });

  test("keeps explicit count", () => {
    const outcome = resolveEffectiveRequest({
      travelDate: "2026-11-21",
      startTime: "09:00",
      endTime: "15:00",
      categories: ["seed-kuliner"],
      destinationCount: 3,
    });
    expect(outcome.kind).toBe("ready");
    if (outcome.kind !== "ready") return;
    expect(outcome.trip.destinationCount).toBe(3);
  });
});

describe("full day", () => {
  test("seharian means morning through night", () => {
    expect(parseFullDay("seharian")).toEqual({ startTime: "08:00", endTime: "21:00" });
    expect(parseFullDay("1 hari")).toEqual({ startTime: "08:00", endTime: "21:00" });
    expect(parseGeneralTimeOfDay("seharian aja")).toEqual({ startTime: "08:00", endTime: "21:00" });
  });
});

describe("parseTimeChange", () => {
  test("explicit start", () => {
    expect(parseTimeChange("ubah jam jadi 10 pagi")).toEqual({ startTime: "10:00" });
  });

  test("bare slot and seharian", () => {
    expect(parseTimeChange("sore aja")).toEqual({ startTime: "15:00", endTime: "17:59" });
    expect(parseTimeChange("jadwalnya jadi seharian")).toEqual({ startTime: "08:00", endTime: "21:00" });
  });

  test("explicit range", () => {
    expect(parseTimeChange("ubah jam jadi 8 sampai 12")).toEqual({ startTime: "08:00", endTime: "12:00" });
  });

  test("ignores ordinary chatter", () => {
    expect(parseTimeChange("saya mau ngedate besok")).toBeNull();
  });
});
