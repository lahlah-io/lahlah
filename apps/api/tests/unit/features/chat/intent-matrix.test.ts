import { afterEach, describe, expect, test } from "vitest";
import { classify } from "../../../../src/modules/chat/services/classifier.js";
import { loadFixture } from "../../../helpers/fixtures.js";

type IntentCase = {
  id: string;
  input: string;
  expectedIntent: string;
  mode: "rule" | "model" | "todo";
  note?: string;
};

const fixture = loadFixture<{ datasetVersion: string; promptVersion: string; cases: IntentCase[] }>("intent-cases");
const env = {
  AI_BASE_URL: "https://classifier.example/v1",
  AI_API_KEY: "test-key",
  AI_CLASSIFIER_MODEL: "test-classifier",
} as NodeJS.ProcessEnv;
const originalFetch = globalThis.fetch;

function stubModel(intent: string, confidence = 0.95) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ intent, confidence }) }, finish_reason: "stop" }] }), {
      status: 200,
    })) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe(`intent recognition matrix (${fixture.datasetVersion}, ${fixture.promptVersion})`, () => {
  for (const item of fixture.cases) {
    if (item.mode === "todo") {
      test.todo(`${item.id}: ${item.note}`);
      continue;
    }
    test(`${item.id} ${item.mode}: ${item.input}`, async () => {
      if (item.mode === "model") stubModel(item.expectedIntent);
      else globalThis.fetch = (() => Promise.reject(new Error("rule case must not call provider"))) as typeof fetch;

      const result = await classify(item.input, env);
      expect(result.intent).toBe(item.expectedIntent);
      expect(result.source).toBe(item.mode === "rule" ? "rule" : "model");
    });
  }

  test("low confidence falls back to missing_information", async () => {
    stubModel("generate_itinerary", 0.4);
    await expect(classify("mungkin jalan-jalan", env)).resolves.toMatchObject({
      intent: "missing_information",
      source: "rule",
    });
  });

  test("malformed provider output never triggers an itinerary intent", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "not json" }, finish_reason: "stop" }] }), {
        status: 200,
      })) as typeof fetch;
    await expect(classify("mungkin jalan-jalan", env)).resolves.toMatchObject({
      intent: "missing_information",
    });
  });
});
