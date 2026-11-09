import { describe, expect, test } from "vitest";
import {
  analyzeTripRequest,
  extractCategories,
  parseFlexibleDate,
  parseFlexibleTimeRange,
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

  test("relative date uses Asia/Jakarta, not server local time", () => {
    // 2026-11-09T18:00Z is already 2026-11-10 01:00 in Jakarta.
    const lateUtc = new Date("2026-11-09T18:00:00.000Z");
    expect(parseFlexibleDate("hari ini", lateUtc)).toBe("2026-11-10");
    expect(parseFlexibleDate("besok", lateUtc)).toBe("2026-11-11");
  });

  test("incomplete request is not treated as ready", () => {
    expect(analyzeTripRequest("Besok siang", refNow)).toMatchObject({
      kind: "general_time",
      dateHint: "2026-11-10",
    });
  });
});
