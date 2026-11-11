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
    expect(mergeCategories(["kuliner"], "Tambahkan alam", ["alam"])).toEqual([
      "kuliner",
      "alam",
    ]);
  });

  test("replaces on ganti/ubah/jadi", () => {
    expect(mergeCategories(["kuliner"], "ganti jadi alam", ["alam"])).toEqual(["alam"]);
  });

  test("preserves prior when latest has no category word", () => {
    expect(mergeCategories(["kuliner", "alam"], "3 destinasi saja", [])).toEqual([
      "kuliner",
      "alam",
    ]);
  });

  test("dedupes the union", () => {
    expect(mergeCategories(["kuliner"], "Tambahkan kuliner", ["kuliner"])).toEqual(["kuliner"]);
  });

  test("replaces with 'saja'/'hanya' and preserves on no category word", () => {
    expect(mergeCategories(["kuliner", "alam"], "Kuliner saja", ["kuliner"])).toEqual(["kuliner"]);
    expect(mergeCategories(["kuliner", "alam"], "Hanya alam", ["alam"])).toEqual(["alam"]);
    expect(mergeCategories(["kuliner"], "Sore saja", [])).toEqual(["kuliner"]);
  });
});

describe("accumulateTripParams (matrix)", () => {
  test("CTX-001/002/003/004: accumulates date, category, time, count across turns", () => {
    let h: Array<{ role: string; content: string }> = [{ role: "user", content: "Buat itinerary besok" }];
    let r = accumulateTripParams(h, "Buat itinerary besok", refNow);
    expect(r.params.travelDate).toBe("2026-11-10");

    h = [...h, { role: "assistant", content: "ok" }, { role: "user", content: "Kuliner" }];
    r = accumulateTripParams(h, "Kuliner", refNow);
    expect(r.params).toMatchObject({ travelDate: "2026-11-10", categories: ["kuliner"] });

    h = [...h, { role: "assistant", content: "ok" }, { role: "user", content: "Sore saja" }];
    r = accumulateTripParams(h, "Sore saja", refNow);
    expect(r.params).toMatchObject({ travelDate: "2026-11-10", categories: ["kuliner"], startTime: "15:00", endTime: "17:59" });

    h = [...h, { role: "assistant", content: "ok" }, { role: "user", content: "3 destinasi" }];
    r = accumulateTripParams(h, "3 destinasi", refNow);
    expect(r.params).toMatchObject({ travelDate: "2026-11-10", categories: ["kuliner"], startTime: "15:00", endTime: "17:59", destinationCount: 3 });
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
    expect(r.params.categories).toEqual(["kuliner", "alam"]);

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
    expect(r.params.categories).toEqual(["kuliner"]);
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
      categories: ["kuliner"],
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
      categories: ["kuliner"],
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
      categories: ["kuliner"],
    });
    expect(outcome.kind).toBe("ready");
    if (outcome.kind === "ready") {
      expect(outcome.trip).toEqual({
        travelDate: "2026-11-10",
        startTime: "15:00",
        endTime: "18:00",
        categories: ["kuliner"],
        destinationCount: 8,
      });
    }
  });

  test("date only (no time, single category) uses the category's default slot", () => {
    const outcome = resolveEffectiveRequest({ travelDate: "2026-11-10", categories: ["kuliner"] }, refNow);
    expect(outcome).toEqual({
      kind: "ready",
      trip: {
        travelDate: "2026-11-10",
        startTime: "11:00",
        endTime: "14:59",
        categories: ["kuliner"],
        destinationCount: 8,
      },
    });
  });

  test("no date defaults to today (Jakarta) with carried explicit time", () => {
    const outcome = resolveEffectiveRequest({ startTime: "15:00", endTime: "18:00", categories: ["kuliner"] }, refNow);
    expect(outcome).toEqual({
      kind: "ready",
      trip: {
        travelDate: "2026-11-09",
        startTime: "15:00",
        endTime: "18:00",
        categories: ["kuliner"],
        destinationCount: 8,
      },
    });
  });

  test("no date and no time still ready with defaults and hybrid slot", () => {
    // Bug nyata: "Buat itinerary kategori pantai" harus langsung jadi draft, bukan missing_information.
    const outcome = resolveEffectiveRequest({ categories: ["pantai"] }, refNow);
    expect(outcome).toEqual({
      kind: "ready",
      trip: {
        travelDate: "2026-11-09",
        startTime: "06:00",
        endTime: "10:59",
        categories: ["pantai"],
        destinationCount: 8,
      },
    });
  });

  test("mixed categories fall back to full-day slot", () => {
    const outcome = resolveEffectiveRequest({ categories: ["pantai", "budaya"] }, refNow);
    expect(outcome.kind).toBe("ready");
    if (outcome.kind === "ready") {
      expect(outcome.trip.startTime).toBe("08:00");
      expect(outcome.trip.endTime).toBe("21:00");
    }
  });
});