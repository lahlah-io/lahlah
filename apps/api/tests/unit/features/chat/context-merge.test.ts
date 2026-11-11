import { describe, expect, test } from "vitest";
import {
  accumulateTripParams,
  mergeCategories,
  messageContributesParams,
  resolveEffectiveRequest,
} from "../../../../src/modules/chat/services/chat.service.js";

// 03:00 UTC = 10:00 Asia/Jakarta on 2026-11-09 (so "besok" = 2026-11-10).
const refNow = new Date("2026-11-09T03:00:00.000Z");

describe("messageContributesParams", () => {
  test("detects a time-of-day follow-up", () => {
    expect(messageContributesParams("Sore", refNow)).toBe(true);
  });

  test("rejects a question that adds no trip parameter", () => {
    expect(messageContributesParams("Apa destinasi pertama?", refNow)).toBe(false);
  });
});

describe("mergeCategories", () => {
  test("adds a new category", () => {
    expect(mergeCategories(["seed-kuliner"], "Tambahkan alam", ["seed-alam"])).toEqual([
      "seed-kuliner",
      "seed-alam",
    ]);
  });

  test("replaces on ganti/ubah/jadi", () => {
    expect(mergeCategories(["seed-kuliner"], "ganti jadi alam", ["seed-alam"])).toEqual(["seed-alam"]);
  });

  test("preserves prior when latest has no category word", () => {
    expect(mergeCategories(["seed-kuliner", "seed-alam"], "3 destinasi saja", [])).toEqual([
      "seed-kuliner",
      "seed-alam",
    ]);
  });

  test("dedupes the union", () => {
    expect(mergeCategories(["seed-kuliner"], "Tambahkan kuliner", ["seed-kuliner"])).toEqual(["seed-kuliner"]);
  });
});

describe("accumulateTripParams", () => {
  test("accumulates across turns without double-applying current", () => {
    const history = [
      { role: "user", content: "Buat itinerary besok" },
      { role: "assistant", content: "..." },
      { role: "user", content: "Kuliner" },
      { role: "assistant", content: "..." },
      { role: "user", content: "Sore" },
    ];
    const { params, pending } = accumulateTripParams(history, "Sore", refNow);
    expect(params).toEqual({
      travelDate: "2026-11-10",
      startTime: "15:00",
      endTime: "18:00",
      categories: ["seed-kuliner"],
      destinationCount: undefined,
    });
    expect(pending).toBe(true);
  });

  test("pending is false when current is the only user message", () => {
    const { params, pending } = accumulateTripParams(
      [{ role: "user", content: "Sore" }],
      "Sore",
      refNow,
    );
    expect(params).toEqual({
      startTime: "15:00",
      endTime: "18:00",
      categories: [],
      destinationCount: undefined,
    });
    expect(pending).toBe(false);
  });

  test("applies current once when it does not literally appear in history", () => {
    const history = [
      { role: "user", content: "Buat itinerary besok" },
      { role: "assistant", content: "..." },
      { role: "user", content: "Kuliner" },
    ];
    const { params, pending } = accumulateTripParams(history, "Sore", refNow);
    expect(params).toEqual({
      travelDate: "2026-11-10",
      startTime: "15:00",
      endTime: "18:00",
      categories: ["seed-kuliner"],
      destinationCount: undefined,
    });
    expect(pending).toBe(true);
  });
});

describe("resolveEffectiveRequest", () => {
  test("count present applies default full-day time and no category filter", () => {
    const outcome = resolveEffectiveRequest({
      travelDate: "2026-11-10",
      destinationCount: 3,
      categories: [],
    });
    expect(outcome).toEqual({
      kind: "ready",
      trip: {
        travelDate: "2026-11-10",
        startTime: "08:00",
        endTime: "21:00",
        categories: [],
        destinationCount: 3,
      },
    });
  });

  test("date + explicit time + categories is ready", () => {
    const outcome = resolveEffectiveRequest({
      travelDate: "2026-11-10",
      startTime: "15:00",
      endTime: "18:00",
      categories: ["seed-kuliner"],
    });
    expect(outcome.kind).toBe("ready");
    if (outcome.kind === "ready") {
      expect(outcome.trip).toEqual({
        travelDate: "2026-11-10",
        startTime: "15:00",
        endTime: "18:00",
        categories: ["seed-kuliner"],
      });
    }
  });

  test("date only (no time, with categories) is general_time", () => {
    const outcome = resolveEffectiveRequest({
      travelDate: "2026-11-10",
      categories: ["seed-kuliner"],
    });
    expect(outcome).toEqual({
      kind: "general_time",
      dateHint: "2026-11-10",
      categories: ["seed-kuliner"],
    });
  });

  test("no date is missing with carried time hint", () => {
    const outcome = resolveEffectiveRequest({
      startTime: "15:00",
      endTime: "18:00",
      categories: ["seed-kuliner"],
    });
    expect(outcome).toEqual({
      kind: "missing",
      dateHint: null,
      timeHint: { startTime: "15:00", endTime: "18:00" },
      categories: ["seed-kuliner"],
    });
  });
});