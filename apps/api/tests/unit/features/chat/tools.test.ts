import assert from "node:assert/strict";
import { test } from "vitest";
import { randomUUID } from "node:crypto";
import { HttpError } from "../../../../src/shared/http/errors.js";

type ToolDeps = {
  searchDestinations: (input: { keywords?: string; categories?: string[] }) => Promise<unknown[]>;
  getDestinationDetails: (input: { destinationIds: string[] }) => Promise<unknown[]>;
};

async function loadTools() {
  const mod = await import("../../../../src/modules/chat/services/tools.js");
  return mod as typeof mod & {
    toolDefinitions: Array<{ type: string; function: { name: string } }>;
    createToolExecutor: (deps: ToolDeps) => (name: string, rawArgs: unknown) => Promise<unknown>;
    executeTool: (name: string, rawArgs: unknown, deps: ToolDeps) => Promise<unknown>;
    mergeDestinationRows: (acc: Map<string, Record<string, unknown>>, result: unknown) => Map<string, Record<string, unknown>>;
  };
}

function baseDeps(overrides: Partial<ToolDeps> = {}): ToolDeps {
  return {
    searchDestinations: async () => [],
    getDestinationDetails: async () => [],
    ...overrides,
  };
}

test("chat tool registry exposes search and detail tools", async () => {
  const { toolDefinitions } = await loadTools();
  const names = toolDefinitions.map((t) => t.function.name).sort();
  assert.deepEqual(names, ["get_destination_details", "search_destinations"]);
});

test("rejects unknown tool name", async () => {
  const { executeTool } = await loadTools();
  await assert.rejects(
    () => executeTool("drop_table", {}, baseDeps()),
    (err: unknown) => err instanceof HttpError && err.status === 422 && err.code === "TOOL_UNKNOWN",
  );
});

test("rejects invalid search args", async () => {
  const { executeTool } = await loadTools();
  await assert.rejects(
    () => executeTool("search_destinations", { keywords: 123 }, baseDeps()),
    (err: unknown) => err instanceof HttpError && err.code === "TOOL_ARGS_INVALID",
  );
});

test("drops unknown category slug instead of rejecting", async () => {
  const { executeTool } = await loadTools();
  let seen: { categories?: string[] } | undefined;
  const result = (await executeTool(
    "search_destinations",
    { categories: ["not-a-real-slug"] },
    baseDeps({
      searchDestinations: async (input: { categories?: string[] }) => {
        seen = input;
        return [];
      },
    }),
  )) as unknown[];
  assert.deepEqual(seen?.categories ?? [], []);
  assert.deepEqual(result, []);
});

test("rejects non-UUID destination ids", async () => {
  const { executeTool } = await loadTools();
  await assert.rejects(
    () => executeTool("get_destination_details", { destinationId: "abc" }, baseDeps()),
    (err: unknown) => err instanceof HttpError && err.code === "TOOL_ARGS_INVALID",
  );
  await assert.rejects(
    () => executeTool("get_destination_details", { destinationIds: [randomUUID(), "nope"] }, baseDeps()),
    (err: unknown) => err instanceof HttpError && err.code === "TOOL_ARGS_INVALID",
  );
});

test("caps search result count", async () => {
  const { executeTool } = await loadTools();
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: String(i), name: `d${i}` }));
  let seen: { keywords?: string; categories?: string[] } | undefined;
  const result = (await executeTool(
    "search_destinations",
    { keywords: "pantai" },
    baseDeps({
      searchDestinations: async (input) => {
        seen = input;
        return rows;
      },
    }),
  )) as unknown[];
  assert.equal(seen?.keywords, "pantai");
  assert.ok(Array.isArray(result));
  assert.ok(result.length <= 10);
});

test("filters out inactive/non-Padang detail rows returned by repo", async () => {
  const { executeTool } = await loadTools();
  const id = randomUUID();
  const result = (await executeTool(
    "get_destination_details",
    { destinationId: id },
    baseDeps({
      getDestinationDetails: async () => [
        { id, name: "ok", city: "Padang", isActive: true, description: null, address: null, latitude: null, longitude: null, details: {}, categories: [] },
        { id: randomUUID(), name: "inactive", city: "Padang", isActive: false },
        { id: randomUUID(), name: "other", city: "Jakarta", isActive: true },
      ],
    }),
  )) as Array<Record<string, unknown>>;
  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, id);
  assert.equal(result[0]?.city, "Padang");
  assert.equal(result[0]?.isActive, true);
  assert.equal("canonicalKey" in result[0]!, false);
});

test("mergeDestinationRows accumulates across calls and dedupes by id", async () => {
  const { mergeDestinationRows } = await loadTools();
  const acc = new Map<string, Record<string, unknown>>();
  mergeDestinationRows(acc, [
    { id: "a", name: "A", latitude: -0.9, longitude: 100.35 },
    { id: "b", name: "B", latitude: -0.91, longitude: 100.36 },
  ]);
  mergeDestinationRows(acc, [
    { id: "b", name: "B-second", latitude: -0.91, longitude: 100.36 },
    { id: "c", name: "C", latitude: -0.92, longitude: 100.37 },
  ]);
  mergeDestinationRows(acc, { id: "ignored", name: "not an array" });

  assert.deepEqual([...acc.keys()].sort(), ["a", "b", "c"]);
  assert.equal((acc.get("b") as Record<string, unknown>).name, "B");
});
