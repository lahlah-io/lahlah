import assert from "node:assert/strict";
import { test } from "vitest";
import { buildAnswererSystemPrompt, formatItineraryReply, generateNaturalReply, isClearlyOffTopic, OFF_TOPIC_REPLY, ONE_TRIP_PER_CHAT } from "../../../../src/modules/chat/services/answerer.js";

const stops = [
  { position: 1, name: "Pantai Air Manis", arrivalTime: "08:00" },
  { position: 2, name: "Museum Adityawarman", arrivalTime: null },
];

test("formatItineraryReply lists date, stops, and next step", () => {
  const msg = formatItineraryReply({ kind: "generate", versionNumber: 1, travelDate: "2026-11-20", startTime: "08:00", endTime: "16:00", stops });
  assert.ok(msg.includes("Jumat, 20 November 2026"));
  assert.ok(msg.includes("08:00–16:00"));
  assert.ok(msg.includes("1. 08:00 Pantai Air Manis"));
  assert.ok(msg.includes("2. Museum Adityawarman"));
  assert.ok(msg.includes("versi 1"));
  assert.ok(/ganti destinasi ke-/.test(msg));
});

test("formatItineraryReply mentions update and defaults", () => {
  const msg = formatItineraryReply({ kind: "update", versionNumber: 3, travelDate: "2026-11-20", startTime: "08:00", endTime: "16:00", stops, defaults: ["jam 08:00-16:00"] });
  assert.ok(msg.includes("versi 3"));
  assert.ok(msg.includes("2 destinasi"));
  assert.ok(msg.includes("jam 08:00-16:00"));
});

test("formatItineraryReply speaks 'trip', never 'itinerary'", () => {
  for (const kind of ["generate", "update", "select"] as const) {
    const msg = formatItineraryReply({ kind, versionNumber: 2, travelDate: "2026-11-20", startTime: "06:00", endTime: "10:59", stops });
    assert.ok(!/itinerar/i.test(msg), msg);
    assert.ok(/trip/i.test(msg), msg);
  }
});

test("answerer prompt tells the model to say 'trip'", () => {
  assert.ok(buildAnswererSystemPrompt("").includes('"trip"'));
});

test("answerer prompt addresses the user as 'kamu', never 'Anda'", () => {
  const prompt = buildAnswererSystemPrompt("");
  assert.ok(prompt.includes('"kamu"'));
  assert.ok(prompt.includes('"Anda"'));
});

test("isClearlyOffTopic catches obvious code/politics questions", () => {
  for (const text of ["siapa presiden amerika sekarang?", "tolong tuliskan kode python untuk sorting", "cara belajar javascript", "hasil pemilu 2024", "apa cuaca di jakarta hari ini?"]) {
    assert.equal(isClearlyOffTopic(text), true, text);
  }
});

test("isClearlyOffTopic leaves greetings and Padang travel alone", () => {
  for (const text of ["halo", "rekomendasi pantai di padang", "berapa lama trip ini?", "museum presiden di padang ada?", "kode promo tiket", "terima kasih", "cuaca di padang besok gimana?"]) {
    assert.equal(isClearlyOffTopic(text), false, text);
  }
});

test("OFF_TOPIC_REPLY is friendly and points back to Padang trips", () => {
  assert.ok(/padang/i.test(OFF_TOPIC_REPLY));
  assert.ok(/trip/i.test(OFF_TOPIC_REPLY));
  assert.ok(!/\banda\b/i.test(OFF_TOPIC_REPLY));
});

test("ONE_TRIP_PER_CHAT explains one chat = one trip and points to new chat", () => {
  assert.ok(/1 chat/i.test(ONE_TRIP_PER_CHAT));
  assert.ok(/chat baru/i.test(ONE_TRIP_PER_CHAT));
  assert.ok(!/itinerar/i.test(ONE_TRIP_PER_CHAT));
});

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
