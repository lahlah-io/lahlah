import assert from "node:assert/strict";
import test from "node:test";
import { completeChat, normalizeChatCompletionResponse } from "../../src/integrations/ai/chat-completions.js";
import { createToolExecutor, toolDefinitions } from "../../src/modules/chat/services/tools.js";
import * as destinationsRepository from "../../src/modules/destinations/repositories/destinations.repository.js";

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

function toNumber(value: { toNumber(): number } | null) {
  return value == null ? null : value.toNumber();
}

const executor = createToolExecutor({
  searchDestinations: async (input) => {
    // composition-root style: query only Padang active rows via repo; tool passes validated filters.
    const result = await destinationsRepository.findDestinations({
      city: "Padang",
      page: 1,
      limit: 10,
      ...(input.categories?.[0] ? { category: input.categories[0] } : {}),
    });
    const q = input.keywords?.trim().toLowerCase();
    const rows = result.data
      .filter((r) => !q || `${r.name} ${r.description ?? ""}`.toLowerCase().includes(q))
      .map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        address: r.address,
        latitude: toNumber(r.latitude),
        longitude: toNumber(r.longitude),
        details: r.details,
        categories: r.categories.map((c) => c.category),
        city: r.city,
        isActive: r.isActive,
      }));
    return rows;
  },
  getDestinationDetails: async (input) => {
    const rows = await Promise.all(input.destinationIds.map((id) => destinationsRepository.findDestinationById(id)));
    return rows
      .filter((r): r is NonNullable<typeof r> => r != null)
      .map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        address: r.address,
        latitude: toNumber(r.latitude),
        longitude: toNumber(r.longitude),
        details: r.details,
        categories: r.categories.map((c) => c.category),
        city: r.city,
        isActive: r.isActive,
      }));
  },
});

test("fake provider tool call executes only registered handler against real Padang DB data", async () => {
  const cfg = { baseUrl: "https://fake.test/v1", apiKey: "k", model: "m", provider: "fake" };

  await withFetch(
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.ok(body.tools?.some((t: { function: { name: string } }) => t.function.name === "search_destinations"));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: { name: "search_destinations", arguments: JSON.stringify({ keywords: "pantai" }) },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        }),
        { status: 200 },
      );
    },
    async () => {
      const completion = await completeChat({
        role: "tool",
        config: cfg,
        messages: [{ role: "user", content: "cari pantai di padang" }],
        tools: toolDefinitions,
        toolChoice: "required",
      });
      assert.equal(completion.toolCalls.length, 1);
      assert.equal(completion.toolCalls[0]?.name, "search_destinations");
      const result = (await executor(completion.toolCalls[0]!.name, completion.toolCalls[0]!.arguments)) as Array<{
        city: string | null;
        isActive: boolean;
        id: string;
      }>;
      assert.ok(Array.isArray(result));
      assert.ok(result.length >= 1, "expected seeded Padang results");
      for (const row of result) {
        assert.equal(row.city, "Padang");
        assert.equal(row.isActive, true);
        assert.equal(typeof row.id, "string");
        assert.equal("canonicalKey" in row, false);
      }
    },
  );
});

test("normalizes provider tool call response shape", () => {
  const out = normalizeChatCompletionResponse({
    choices: [
      {
        message: {
          tool_calls: [{ id: "x", function: { name: "search_destinations", arguments: "{\"keywords\":\"kota\"}" } }],
        },
      },
    ],
  });
  assert.equal(out.toolCalls[0]?.name, "search_destinations");
});
