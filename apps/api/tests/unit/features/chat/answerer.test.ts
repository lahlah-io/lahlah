import assert from "node:assert/strict";
import { test } from "vitest";
import { buildAnswererSystemPrompt, generateNaturalReply } from "../../../../src/modules/chat/services/answerer.js";

const cfg = { baseUrl: "https://x.test/v1", apiKey: "k", model: "m", provider: "openai-compatible" };

test("buildAnswererSystemPrompt includes KB when present", () => {
  const prompt = buildAnswererSystemPrompt('[{"name":"Pantai Air Manis"}]');
  assert.ok(prompt.includes("[{"));
  assert.ok(prompt.includes("Pantai Air Manis"));
});

test("buildAnswererSystemPrompt omits KB section when empty", () => {
  const prompt = buildAnswererSystemPrompt("");
  assert.ok(!prompt.includes("Knowledge base"));
});

test("buildAnswererSystemPrompt appends the hint", () => {
  const prompt = buildAnswererSystemPrompt("", "ask for missing details");
  assert.ok(prompt.includes("ask for missing details"));
});

test("generateNaturalReply returns model content", async () => {
  const calls: unknown[] = [];
  const out = await generateNaturalReply(
    {
      resolveConfig: () => cfg,
      retrieveRagContext: async () => '[{"name":"Pantai Air Manis"}]',
      completeAiChat: async (input) => {
        calls.push(input);
        return {
          content: "Pantai Air Manis cocok untuk pagi hari.",
          toolCalls: [],
          finishReason: "stop",
          usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 },
        };
      },
    },
    { userMessage: "rekomendasi pantai", history: [{ role: "user", content: "halo" }] },
  );
  assert.equal(out.message, "Pantai Air Manis cocok untuk pagi hari.");
  assert.deepEqual(out.usage, { inputTokens: 10, outputTokens: 3 });
  const sent = calls[0] as { messages: Array<{ role: string; content: string }> };
  assert.ok(sent.messages.some((m) => m.role === "system" && m.content.includes("Pantai Air Manis")));
});

test("generateNaturalReply falls back on provider error", async () => {
  const out = await generateNaturalReply(
    {
      resolveConfig: () => cfg,
      completeAiChat: async () => {
        throw new Error("boom");
      },
    },
    { userMessage: "hai", history: [] },
  );
  assert.ok(out.message.length > 0);
  assert.deepEqual(out.usage, {});
});

test("generateNaturalReply ignores retrieveRagContext failure", async () => {
  const out = await generateNaturalReply(
    {
      resolveConfig: () => cfg,
      retrieveRagContext: async () => {
        throw new Error("rag down");
      },
      completeAiChat: async () => ({ content: "ok", toolCalls: [], finishReason: "stop" }),
    },
    { userMessage: "hai", history: [] },
  );
  assert.equal(out.message, "ok");
});
