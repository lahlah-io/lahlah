import { describe, expect, test } from "vitest";
import { analyzeTripRequest } from "../../../../src/modules/chat/services/chat.service.js";
import { loadFixture } from "../../../helpers/fixtures.js";

type ClarificationCase = {
  id: string;
  input: string;
  expectedKind: string;
  expectedDateHint?: string | null;
  mode?: "todo";
  note?: string;
};

const fixture = loadFixture<{ datasetVersion: string; promptVersion: string; referenceDate: string; cases: ClarificationCase[] }>("clarification-cases");
const refNow = new Date(`${fixture.referenceDate}T03:00:00.000Z`);

describe(`clarification matrix (${fixture.datasetVersion}, ${fixture.promptVersion})`, () => {
  for (const item of fixture.cases) {
    if (item.mode === "todo") {
      test.todo(`${item.id}: ${item.note}`);
      continue;
    }
    test(`${item.id}: ${item.input}`, () => {
      const outcome = analyzeTripRequest(item.input, refNow);
      expect(outcome.kind).toBe(item.expectedKind);
      if (item.expectedKind === "general_time") {
        expect(outcome.dateHint).toBe(item.expectedDateHint ?? null);
      }
      expect(outcome.kind).not.toBe("ready");
    });
  }

  test("complete parameters are ready and include all three inputs", () => {
    expect(analyzeTripRequest("Buat itinerary 2026-11-20 jam 08:00-16:00 pantai", refNow)).toEqual({
      kind: "ready",
      trip: {
        travelDate: "2026-11-20",
        startTime: "08:00",
        endTime: "16:00",
        categories: ["pantai"],
      },
    });
  });
});
