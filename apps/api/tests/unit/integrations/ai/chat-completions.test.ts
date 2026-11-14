import assert from "node:assert/strict";
import { test } from "vitest";
import {
  completeChat,
  normalizeChatCompletionResponse,
  resolveAiRoleConfig,
} from "../../../../src/integrations/ai/chat-completions.js";
import { HttpError } from "../../../../src/shared/http/errors.js";

function withFetch(
  impl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>,
) {
  const prev = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = prev;
  });
}

test("builds classifier request without tools using resolved config", async () => {
  const cfg = resolveAiRoleConfig("classifier", {
    AI_BASE_URL: "https://shared.example/v1",
    AI_API_KEY: "shared",
    AI_PROVIDER: "openai-compatible",
    AI_CLASSIFIER_MODEL: "cls-model",
    AI_CLASSIFIER_BASE_URL: "https://cls.example/v1",
    AI_CLASSIFIER_API_KEY: "cls-key",
  } as NodeJS.ProcessEnv);
  assert.equal(cfg.model, "cls-model");
  assert.equal(cfg.baseUrl, "https://cls.example/v1");
  assert.equal(cfg.apiKey, "cls-key");

  await withFetch(async (url, init) => {
    assert.equal(String(url), "https://cls.example/v1/chat/completions");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer cls-key");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "cls-model");
    assert.equal(body.tools, undefined);
    assert.deepEqual(body.messages, [{ role: "user", content: "hi" }]);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }),
      { status: 200 },
    );
  }, async () => {
    const out = await completeChat({
      role: "classifier",
      config: cfg,
      messages: [{ role: "user", content: "hi" }],
    });
    assert.equal(out.content, "ok");
    assert.deepEqual(out.toolCalls, []);
  });
});

test("builds tool-model request with tools/toolChoice using role fallback", async () => {
  const cfg = resolveAiRoleConfig("tool", {
    AI_BASE_URL: "https://shared.example/v1",
    AI_API_KEY: "shared",
    AI_TOOL_MODEL: "tool-model",
  } as NodeJS.ProcessEnv);
  assert.equal(cfg.baseUrl, "https://shared.example/v1");
  assert.equal(cfg.apiKey, "shared");

  await withFetch(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "tool-model");
    assert.equal(body.tool_choice, "required");
    assert.equal(body.tools?.[0]?.function?.name, "search_destinations");
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: { tool_calls: [{ id: "c1", function: { name: "search_destinations", arguments: "{\"city\":\"Padang\"}" } }] },
            finish_reason: "tool_calls",
          },
        ],
      }),
      { status: 200 },
    );
  }, async () => {
    const out = await completeChat({
      role: "tool",
      config: cfg,
      messages: [{ role: "user", content: "trip" }],
      tools: [{ type: "function", function: { name: "search_destinations", parameters: { type: "object" } } }],
      toolChoice: "required",
    });
    assert.equal(out.toolCalls.length, 1);
    assert.equal(out.toolCalls[0]?.name, "search_destinations");
    assert.deepEqual(out.toolCalls[0]?.arguments, { city: "Padang" });
  });
});

test("parses multiple tool calls", () => {
  const out = normalizeChatCompletionResponse({
    choices: [
      {
        message: {
          tool_calls: [
            { id: "a", function: { name: "search_destinations", arguments: "{}" } },
            { id: "b", function: { name: "get_destination_details", arguments: "{\"destinationIds\":[]}" } },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
  });
  assert.equal(out.toolCalls.length, 2);
  assert.equal(out.toolCalls[1]?.name, "get_destination_details");
});

test("parses usage tokens from provider response", () => {
  const out = normalizeChatCompletionResponse({
    choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
  });
  assert.deepEqual(out.usage, { promptTokens: 12, completionTokens: 7, totalTokens: 19 });
});

test("rejects broken JSON tool arguments", () => {
  assert.throws(
    () =>
      normalizeChatCompletionResponse({
        choices: [{ message: { tool_calls: [{ id: "x", function: { name: "t", arguments: "{bad" } }] } }],
      }),
    (err: unknown) => err instanceof HttpError && err.code === "AI_UPSTREAM_ERROR",
  );
});

test("handles HTTP 429 and 500 from provider", async () => {
  const cfg = { baseUrl: "https://x.test/v1", apiKey: "k", model: "m", provider: "openai-compatible" };
  await withFetch(async () => new Response("rate", { status: 429 }), async () => {
    await assert.rejects(
      () => completeChat({ role: "tool", config: cfg, messages: [{ role: "user", content: "x" }] }),
      (err: unknown) => err instanceof HttpError && err.status === 429 && err.code === "AI_UPSTREAM_ERROR",
    );
  });
  await withFetch(async () => new Response("boom", { status: 500 }), async () => {
    await assert.rejects(
      () => completeChat({ role: "tool", config: cfg, messages: [{ role: "user", content: "x" }] }),
      (err: unknown) => err instanceof HttpError && err.status === 502 && err.code === "AI_UPSTREAM_ERROR",
    );
  });
});

test("rejects text-only response when tool required", async () => {
  const cfg = { baseUrl: "https://x.test/v1", apiKey: "k", model: "m", provider: "openai-compatible" };
  await withFetch(
    async () => new Response(JSON.stringify({ choices: [{ message: { content: "sure" }, finish_reason: "stop" }] }), { status: 200 }),
    async () => {
      await assert.rejects(
        () =>
          completeChat({
            role: "tool",
            config: cfg,
            messages: [{ role: "user", content: "x" }],
            toolChoice: "required",
          }),
        (err: unknown) => err instanceof HttpError && err.code === "TOOL_CALL_REQUIRED",
      );
    },
  );
});

test("maps provider tool_use_failed 400 to TOOL_CALL_REQUIRED without leaking generation", async () => {
  const cfg = { baseUrl: "https://x.test/v1", apiKey: "k", model: "m", provider: "openai-compatible" };
  const body = { error: { code: "tool_use_failed", message: "Tool choice is required", failed_generation: "Maaf, cuaca..." } };
  await withFetch(async () => new Response(JSON.stringify(body), { status: 400 }), async () => {
    await assert.rejects(
      () => completeChat({ role: "tool", config: cfg, messages: [{ role: "user", content: "x" }], toolChoice: "required" }),
      (err: unknown) => err instanceof HttpError && err.status === 422 && err.code === "TOOL_CALL_REQUIRED" && !err.message.includes("Maaf"),
    );
  });
  await withFetch(async () => new Response("bad", { status: 400 }), async () => {
    await assert.rejects(
      () => completeChat({ role: "tool", config: cfg, messages: [{ role: "user", content: "x" }] }),
      (err: unknown) => err instanceof HttpError && err.status === 502 && err.code === "AI_UPSTREAM_ERROR",
    );
  });
});

test("reads per-role reasoning_effort with defaults", () => {
  const cls = resolveAiRoleConfig("classifier", {
    AI_BASE_URL: "https://shared.example/v1",
    AI_API_KEY: "shared",
    AI_CLASSIFIER_MODEL: "cls-model",
  } as NodeJS.ProcessEnv);
  assert.equal(cls.reasoningEffort, "low");

  const tool = resolveAiRoleConfig("tool", {
    AI_BASE_URL: "https://shared.example/v1",
    AI_API_KEY: "shared",
    AI_TOOL_MODEL: "tool-model",
    AI_TOOL_REASONING_EFFORT: "high",
  } as NodeJS.ProcessEnv);
  assert.equal(tool.reasoningEffort, "high");
});

test("sends reasoning_effort when config carries it", async () => {
  const cfg = { baseUrl: "https://x.test/v1", apiKey: "k", model: "m", provider: "openai-compatible", reasoningEffort: "medium" };
  await withFetch(
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.reasoning_effort, "medium");
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }), { status: 200 });
    },
    async () => {
      await completeChat({ role: "tool", config: cfg, messages: [{ role: "user", content: "x" }] });
    },
  );
});

test("missing API key for role -> controlled error", () => {
  assert.throws(
    () => resolveAiRoleConfig("tool", { AI_TOOL_MODEL: "m" } as NodeJS.ProcessEnv),
    (err: unknown) => err instanceof HttpError && err.code === "AI_NOT_CONFIGURED",
  );
});
