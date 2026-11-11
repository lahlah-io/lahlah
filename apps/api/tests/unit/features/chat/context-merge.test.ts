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
    expect(messageContributesParams("Terima kasih", refNow)).toBe(false);
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

  test("replaces with 'saja'/'hanya' and preserves on no category word", () => {
    expect(mergeCategories(["seed-kuliner", "seed-alam"], "Kuliner saja", ["seed-kuliner"])).toEqual(["seed-kuliner"]);
    expect(mergeCategories(["seed-kuliner", "seed-alam"], "Hanya alam", ["seed-alam"])).toEqual(["seed-alam"]);
    expect(mergeCategories(["seed-kuliner"], "Sore saja", [])).toEqual(["seed-kuliner"]);
  });
});

describe("accumulateTripParams (matrix)", () => {
  test("CTX-001/002/003/004: accumulates date, category, time, count across turns", () => {
    let h: Array<{ role: string; content: string }> = [{ role: "user", content: "Buat itinerary besok" }];
    let r = accumulateTripParams(h, "Buat itinerary besok", refNow);
    expect(r.params.travelDate).toBe("2026-11-10");

    h = [...h, { role: "assistant", content: "ok" }, { role: "user", content: "Kuliner" }];
    r = accumulateTripParams(h, "Kuliner", refNow);
    expect(r.params).toMatchObject({ travelDate: "2026-11-10", categories: ["seed-kuliner"] });

    h = [...h, { role: "assistant", content: "ok" }, { role: "user", content: "Sore saja" }];
    r = accumulateTripParams(h, "Sore saja", refNow);
    expect(r.params).toMatchObject({ travelDate: "2026-11-10", categories: ["seed-kuliner"], startTime: "15:00", endTime: "17:59" });

    h = [...h, { role: "assistant", content: "ok" }, { role: "user", content: "3 destinasi" }];
    r = accumulateTripParams(h, "3 destinasi", refNow);
    expect(r.params).toMatchObject({ travelDate: "2026-11-10", categories: ["seed-kuliner"], startTime: "15:00", endTime: "17:59", destinationCount: 3 });
  });

  test("CTX-005/006/007/008: latest explicit field wins; categories union on add", () => {
    let r = accumulateTripParams(
      [{ role: "user", content: "Buat itinerary besok" }, { role: "assistant", content: "ok" }, { role: "user", content: "Ganti ke lusa" }],
      "Ganti ke lusa",
      refNow,
    );
    expect(r.params.travelDate).toBe("2026-11-11");

    r = accumulateTripParams(
      [{ role: "user", content: "Buat itinerary besok kuliner" }, { role: "assistant", content: "ok" }, { role: "user", content: "Tambahkan alam" }],
      "Tambahkan alam",
      refNow,
    );
    expect(r.params.categories).toEqual(["seed-kuliner", "seed-alam"]);

    r = accumulateTripParams(
      [{ role: "user", content: "Buat itinerary besok kuliner sore" }, { role: "assistant", content: "ok" }, { role: "user", content: "Ubah jadi pagi" }],
      "Ubah jadi pagi",
      refNow,
    );
    expect(r.params).toMatchObject({ startTime: "06:00", endTime: "10:59" });

    r = accumulateTripParams(
      [{ role: "user", content: "Buat itinerary besok kuliner sore 5 destinasi" }, { role: "assistant", content: "ok" }, { role: "user", content: "Jadikan 3" }],
      "Jadikan 3",
      refNow,
    );
    expect(r.params.destinationCount).toBe(3);
  });

  test("HIS-003/008: assistant messages ignored; repeated user message does not duplicate params", () => {
    const history = [
      { role: "user", content: "Buat itinerary besok" },
      { role: "assistant", content: "Kategori apa?" },
      { role: "user", content: "Kuliner" },
      { role: "assistant", content: "Jam berapa?" },
      { role: "user", content: "Kuliner" },
    ];
    const r = accumulateTripParams(history, "Kuliner", refNow);
    expect(r.params.travelDate).toBe("2026-11-10");
    expect(r.params.categories).toEqual(["seed-kuliner"]);
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
      endTime: "17:59",
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
      endTime: "17:59",
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
      endTime: "17:59",
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
        destinationCount: 8,
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