import { describe, expect, test } from "vitest";
import { intentLabels, CLASSIFIER_SYSTEM_PROMPT } from "../../../../src/modules/chat/services/classifier.js";
import {
  SYSTEM_PROMPT,
  analyzeTripRequest,
  extractCategories,
  parseFlexibleTimeRange,
} from "../../../../src/modules/chat/services/chat.service.js";
import { generateItinerary } from "../../../../src/modules/chat/services/itinerary-generator.js";
import { loadFixture } from "../../../helpers/fixtures.js";

const fixture = loadFixture<{ datasetVersion: string; promptVersion: string; model: string; postMvp: string[] }>("prompt-cases");
const refNow = new Date("2026-11-09T03:00:00.000Z");

describe(`prompt evaluation matrix (${fixture.datasetVersion}, ${fixture.promptVersion}, model: ${fixture.model})`, () => {
  test("PRM-001: system prompt scopes the assistant to Padang and database-backed tools", () => {
    expect(SYSTEM_PROMPT).toMatch(/Padang/);
    expect(SYSTEM_PROMPT).toMatch(/tools/);
    expect(SYSTEM_PROMPT).toMatch(/database/i);
  });

  test("PRM-002: out-of-scope city is still executed against Padang data, not the user-provided city", () => {
    // The runtime never forwards a user city: request parsing only reads date/time/categories.
    const outcome = analyzeTripRequest("Buat itinerary Bali 2026-11-20 jam 08:00-12:00 pantai", refNow);
    expect(outcome.kind).toBe("ready");
    if (outcome.kind !== "ready") return;
    expect(outcome.trip).not.toHaveProperty("city");
  });

  test("PRM-003: classifier prompt lists every supported intent", () => {
    for (const label of intentLabels) expect(CLASSIFIER_SYSTEM_PROMPT).toContain(label);
  });

  test("PRM-004: extraction prompt contract maps clock phrases to HH:mm", () => {
    expect(parseFlexibleTimeRange("dari jam 8 pagi sampai 3 sore")).toEqual({
      startTime: "08:00",
      endTime: "15:00",
    });
  });

  test("PRM-005: missing date stays empty instead of being invented", () => {
    const outcome = analyzeTripRequest("jam 08:00 sampai 12:00 pantai", refNow);
    expect(outcome).toMatchObject({ kind: "missing", dateHint: null });
  });

  test("PRM-006: requested categories are extracted and passed to generation", () => {
    expect(extractCategories("pantai dan kuliner")).toEqual(["pantai", "kuliner"]);
  });

  test("PRM-007: generation never invents price data", () => {
    const result = generateItinerary(
      { city: "Padang", travelDate: "2026-11-20", startTime: "09:00", endTime: "12:00", categories: [], transportMode: "walk" },
      [{ id: "a", name: "A", latitude: -0.95, longitude: 100.35, details: { estimated_duration_minutes: 60 } }],
    );
    expect(JSON.stringify(result)).not.toMatch(/price|harga|cost|ticket|tiket/i);
  });

  test.todo("PRM-008: English reply language is not implemented (template response is Indonesian).");
  test.todo(`Post-MVP evaluation tools: ${fixture.postMvp.join(", ")}`);
});
