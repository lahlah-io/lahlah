import { describe, expect, test } from "vitest";
import {
  analyzeTripRequest,
  extractCategories,
  extractDestinationCount,
  parseFlexibleDate,
  parseFlexibleTimeRange,
  parseGeneralTimeOfDay,
  wantsMultipleItineraries,
} from "../../../../src/modules/chat/services/chat.service.js";
import { loadFixture } from "../../../helpers/fixtures.js";

type ExtractionCase = {
  id: string;
  input: string;
  expected: { startTime?: string; endTime?: string; categories?: string[]; date?: string; durationMinutes?: number };
  mode: "ready" | "date-only" | "todo";
  note?: string;
};

const fixture = loadFixture<{ datasetVersion: string; promptVersion: string; referenceDate: string; cases: ExtractionCase[] }>("extraction-cases");
// 03:00 UTC = 10:00 Asia/Jakarta on the fixed reference date.
const refNow = new Date(`${fixture.referenceDate}T03:00:00.000Z`);

describe(`parameter extraction matrix (${fixture.datasetVersion}, ${fixture.promptVersion})`, () => {
  for (const item of fixture.cases) {
    if (item.mode === "todo") {
      test.todo(`${item.id}: ${item.note}`);
      continue;
    }
    test(`${item.id}: ${item.input}`, () => {
      if (item.expected.startTime && item.expected.endTime) {
        expect(parseFlexibleTimeRange(item.input)).toEqual({
          startTime: item.expected.startTime,
          endTime: item.expected.endTime,
        });
      }
      if (item.expected.categories) {
        expect(extractCategories(item.input)).toEqual(item.expected.categories);
      }
      if (item.expected.date) {
        expect(parseFlexibleDate(item.input, refNow)).toBe(item.expected.date);
      }
    });
  }

  test("extractCategories ignores 'alam' inside an ordinary word like 'alamat' or 'dalam'", () => {
    expect(extractCategories("Bofet Rajawali Juanda alamatnya di mana?")).toEqual([]);
    expect(extractCategories("rekomendasi tempat wisata dalam kota")).toEqual([]);
    expect(extractCategories("wisata alam")).toEqual(["alam"]);
  });

  test("relative date uses Asia/Jakarta, not server local time", () => {
    // 2026-11-09T18:00Z is already 2026-11-10 01:00 in Jakarta.
    const lateUtc = new Date("2026-11-09T18:00:00.000Z");
    expect(parseFlexibleDate("hari ini", lateUtc)).toBe("2026-11-10");
    expect(parseFlexibleDate("besok", lateUtc)).toBe("2026-11-11");
  });

  test("incomplete request is not treated as ready", () => {
    expect(analyzeTripRequest("Besok siang", refNow)).toMatchObject({
      kind: "missing",
      dateHint: "2026-11-10",
      timeHint: { startTime: "11:00", endTime: "14:59" },
    });
  });

  test("bare time-of-day word resolves to a time slot without 'jam'", () => {
    expect(analyzeTripRequest("Saya mau wisata besok sore pantai", refNow)).toEqual({
      kind: "ready",
      trip: {
        travelDate: "2026-11-10",
        startTime: "15:00",
        endTime: "17:59",
        categories: ["pantai"],
      },
    });
  });

  test("explicit 'jam' keeps a single clock phrase as general_time", () => {
    expect(analyzeTripRequest("Saya mulai jam 10 pagi pantai", refNow)).toMatchObject({
      kind: "general_time",
      dateHint: null,
      categories: ["pantai"],
    });
  });

  test("extracts destination count from digits and Indonesian number words", () => {
    expect(extractDestinationCount("3 destinasi")).toBe(3);
    expect(extractDestinationCount("5 tempat wisata")).toBe(5);
    expect(extractDestinationCount("2 tempat")).toBe(2);
    expect(extractDestinationCount("tiga destinasi")).toBe(3);
    expect(extractDestinationCount("lima lokasi wisata")).toBe(5);
    expect(extractDestinationCount("10 destinasi")).toBe(10);
    expect(extractDestinationCount("dua tempat wisata besok")).toBe(2);
    expect(extractDestinationCount("3 spot kuliner")).toBe(3);
    expect(extractDestinationCount("besok jam 09:00")).toBeNull();
    expect(extractDestinationCount("21 November")).toBeNull();
    expect(extractDestinationCount("3 destinasi jam 09:00")).toBe(3);
    expect(extractDestinationCount("tanpa jumlah")).toBeNull();
    expect(extractDestinationCount("0 destinasi")).toBeNull();
    // shortcut: no upper-bound policy yet; extraction returns the number if > 0.
    expect(extractDestinationCount("15 destinasi")).toBe(15);
    // Ubah-jumlah tanpa kata jumlah eksplisit (percakapan nyata).
    expect(extractDestinationCount("ubah menjadi 3 itenerary nya")).toBe(3);
    expect(extractDestinationCount("jadikan 3")).toBe(3);
    expect(extractDestinationCount("3 destinasi saja")).toBe(3);
    expect(extractDestinationCount("ganti jadi lima")).toBe(5);
  });

  test("distinguishes destination count from multiple-itinerary request", () => {
    expect(extractDestinationCount("buat 3 destinasi")).toBe(3);
    expect(extractDestinationCount("buat 3 itinerary")).toBeNull();
    expect(extractDestinationCount("3 alternatif")).toBeNull();
    expect(wantsMultipleItineraries("buat 3 itinerary")).toBe(true);
    expect(wantsMultipleItineraries("buat 3 pilihan rute")).toBe(true);
    expect(wantsMultipleItineraries("buat 3 alternatif")).toBe(true);
    expect(wantsMultipleItineraries("buat 3 destinasi")).toBe(false);
    expect(wantsMultipleItineraries("tiga destinasi")).toBe(false);
    expect(wantsMultipleItineraries("buat 3 trip")).toBe(true);
    expect(extractDestinationCount("buat 3 trip")).toBeNull();
  });

  test("extracts relative and explicit dates (Jakarta)", () => {
    expect(parseFlexibleDate("hari ini", refNow)).toBe("2026-11-09");
    expect(parseFlexibleDate("besok", refNow)).toBe("2026-11-10");
    expect(parseFlexibleDate("lusa", refNow)).toBe("2026-11-11");
    expect(parseFlexibleDate("21 November 2026", refNow)).toBe("2026-11-21");
  });

  test("time-of-day words produce ready slots with date and category", () => {
    expect(analyzeTripRequest("Saya mau wisata besok siang pantai", refNow)).toEqual({
      kind: "ready",
      trip: {
        travelDate: "2026-11-10",
        startTime: "11:00",
        endTime: "14:59",
        categories: ["pantai"],
      },
    });
  });

  test("ready trip carries destinationCount when a count is present", () => {
    expect(analyzeTripRequest("Buat itinerary 3 destinasi besok pantai sore", refNow).trip.destinationCount).toBe(3);
  });

  test("generic time-of-day slots use standard ranges", () => {
    expect(parseGeneralTimeOfDay("siang")).toEqual({ startTime: "11:00", endTime: "14:59" });
    expect(parseGeneralTimeOfDay("malam")).toEqual({ startTime: "18:00", endTime: "23:59" });
    expect(parseGeneralTimeOfDay("pagi")).toEqual({ startTime: "06:00", endTime: "10:59" });
    expect(parseGeneralTimeOfDay("sore")).toEqual({ startTime: "15:00", endTime: "17:59" });
  });
});
