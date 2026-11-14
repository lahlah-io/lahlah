import assert from "node:assert/strict";
import { test } from "vitest";
import { randomUUID } from "node:crypto";
import { HttpError } from "../../../../src/shared/http/errors.js";

type ToolDeps = {
  searchDestinations: (input: { keywords?: string; categories?: string[]; district?: string }) => Promise<unknown[]>;
  getDestinationDetails: (input: { destinationIds: string[] }) => Promise<unknown[]>;
  defaultCategories?: string[];
  defaultDistrict?: string;
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

test("multi-category search fans out per category and round-robins", async () => {
  const { createToolExecutor } = await loadTools();
  const seen: Array<string[] | undefined> = [];
  const row = (id: string, name: string) => ({ id, name, city: "Padang", isActive: true });
  const poolA = Array.from({ length: 10 }, (_, i) => row(`a${i}`, `A${i}`));
  const poolB = [row("b0", "B0"), row("b1", "B1")];
  const exec = createToolExecutor({
    ...baseDeps({
      searchDestinations: async (input) => {
        seen.push(input.categories);
        return input.categories?.[0] === "pantai" ? poolA : poolB;
      },
    }),
    defaultCategories: ["pantai", "kuliner"],
  } as ToolDeps);
  const result = (await exec("search_destinations", { categories: ["pantai"] })) as Array<{ id: string }>;
  // one query per category, interleaved so kuliner rows are not starved
  assert.deepEqual(seen, [["pantai"], ["kuliner"]]);
  assert.deepEqual(result.map((r) => r.id), ["a0", "b0", "a1", "b1", "a2", "a3", "a4", "a5", "a6", "a7"]);
});

test("model categories are merged with the user's requested categories", async () => {
  const { createToolExecutor } = await loadTools();
  const seen: Array<string[] | undefined> = [];
  const exec = createToolExecutor({
    ...baseDeps({ searchDestinations: async (input) => (seen.push(input.categories), []) }),
    defaultCategories: ["pantai", "budaya"],
  } as ToolDeps);
  await exec("search_destinations", { categories: [] });
  await exec("search_destinations", {});
  await exec("search_destinations", { categories: ["kuliner"] });
  await exec("search_destinations", { categories: ["Pantai", "KELUARGA"] });
  assert.deepEqual(seen, [["pantai"], ["budaya"], ["pantai"], ["budaya"], ["kuliner"], ["pantai"], ["budaya"], ["pantai"], ["keluarga"], ["budaya"]]);
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

test("retries category-only when keyword search finds nothing", async () => {
  const { createToolExecutor } = await loadTools();
  const seen: Array<{ keywords?: string; categories?: string[] }> = [];
  const exec = createToolExecutor({
    ...baseDeps({
      searchDestinations: async (input) => {
        seen.push(input);
        return input.keywords ? [] : [{ id: "c1", name: "C1", city: "Padang", isActive: true }];
      },
    }),
    defaultCategories: ["santai"],
  } as ToolDeps);
  const result = (await exec("search_destinations", { keywords: "sepi ngobrol" })) as Array<{ id: string }>;
  assert.deepEqual(seen, [
    { keywords: "sepi ngobrol", categories: ["santai"] },
    { categories: ["santai"] },
  ]);
  assert.deepEqual(result.map((r) => r.id), ["c1"]);
});

test("falls back to unfiltered search when keywords and categories both miss", async () => {
  const { createToolExecutor } = await loadTools();
  const seen: Array<{ keywords?: string; categories?: string[] }> = [];
  const exec = createToolExecutor({
    ...baseDeps({
      searchDestinations: async (input) => {
        seen.push(input);
        return "keywords" in input || input.categories ? [] : [{ id: "all1", name: "All", city: "Padang", isActive: true }];
      },
    }),
  } as ToolDeps);
  const result = (await exec("search_destinations", { keywords: "ngedate" })) as Array<{ id: string }>;
  assert.deepEqual(seen, [{ keywords: "ngedate" }, {}]);
  assert.deepEqual(result.map((r) => r.id), ["all1"]);
});

test("caps search result count", async () => {  const { executeTool } = await loadTools();
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: String(i), name: `d${i}` }));
  let seen: { keywords?: string; categories?: string[] } | undefined;
  const result = (await executeTool(
    "search_destinations",
    { keywords: "pantai" },
    baseDeps({
      searchDestinations: async (input) => {
        seen = seen ?? input;
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

test("district diteruskan ke searchDestinations", async () => {
  const { executeTool } = await loadTools();
  const seen: Array<{ district?: string }> = [];
  await executeTool(
    "search_destinations",
    { categories: ["kuliner"], district: "Padang Barat" },
    baseDeps({
      searchDestinations: async (input) => {
        seen.push(input);
        return [];
      },
    }),
  );
  assert.equal(seen[0]?.district, "Padang Barat");
});

test("district dari pesan user dipakai saat model tidak mengirimnya", async () => {
  const { createToolExecutor } = await loadTools();
  const seen: Array<{ district?: string }> = [];
  const exec = createToolExecutor({
    ...baseDeps({
      searchDestinations: async (input) => {
        seen.push(input);
        return [{ id: "d1", name: "Pantai", city: "Padang", isActive: true }];
      },
    }),
    defaultDistrict: "Padang Selatan",
  } as ToolDeps);
  await exec("search_destinations", { categories: ["pantai"] });
  await exec("search_destinations", { categories: ["pantai"], district: "Padang Barat" });
  assert.deepEqual(seen.map((s) => s.district), ["Padang Selatan", "Padang Barat"]);
});

test("wilayah hanya pengayaan: hasil kosong di wilayah itu dicari ulang tanpa wilayah", async () => {
  const { createToolExecutor } = await loadTools();
  const seen: Array<{ district?: string }> = [];
  const exec = createToolExecutor({
    ...baseDeps({
      searchDestinations: async (input) => {
        seen.push(input);
        return input.district ? [] : [{ id: "d9", name: "Pantai Air Manis", city: "Padang", isActive: true }];
      },
    }),
    defaultDistrict: "Lubuk Kilangan",
  } as ToolDeps);
  const rows = (await exec("search_destinations", { categories: ["pantai"] })) as Array<{ name: string }>;
  assert.deepEqual(seen.map((s) => s.district), ["Lubuk Kilangan", undefined], "harus retry tanpa wilayah");
  assert.equal(rows[0]?.name, "Pantai Air Manis");
});

test("hasil tool menyertakan wilayah agar jawaban bisa menyebut kecamatan", async () => {
  const { executeTool } = await loadTools();
  const rows = (await executeTool(
    "search_destinations",
    { categories: ["kuliner"] },
    baseDeps({
      searchDestinations: async () => [
        {
          id: "d1", name: "Kebuli Sultan", description: null, address: "Jl. Purus",
          latitude: -0.95, longitude: 100.35, city: "Padang", district: "Padang Barat",
          isActive: true, details: { estimatedCost: { currency: "IDR", min: 20000, max: 50000 } },
          categories: [{ id: "c1", name: "Kuliner", slug: "kuliner" }],
        },
      ],
    }),
  )) as Array<{ district?: string; details?: { estimatedCost?: { min: number } } }>;
  assert.equal(rows[0]?.district, "Padang Barat");
  assert.equal(rows[0]?.details?.estimatedCost?.min, 20000);
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
