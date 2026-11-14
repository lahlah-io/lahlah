import { describe, expect, test } from "vitest";
import { parseFlexibleDate } from "../../../../src/modules/chat/services/chat.service.js";

// 2026-11-14 is a Saturday.
const saturday = new Date("2026-11-14T03:00:00.000Z");

describe("weekday resolution", () => {
  test("a named weekday means its next occurrence, not today", () => {
    expect(parseFlexibleDate("aku free hari selasa", saturday)).toBe("2026-11-17");
  });

  test("today's own weekday stays today", () => {
    expect(parseFlexibleDate("sabtu", saturday)).toBe("2026-11-14");
  });

  test("explicit dates still win", () => {
    expect(parseFlexibleDate("selasa 2026-12-01", saturday)).toBe("2026-12-01");
  });
});
