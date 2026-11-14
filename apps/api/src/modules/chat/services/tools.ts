import { z } from "zod";
import type { AiToolDefinition } from "../../../integrations/ai/schemas.js";
import { HttpError } from "../../../shared/http/errors.js";

const SEARCH_LIMIT = 10;
const KNOWN_CATEGORY_SLUGS = new Set([
  "seed-pantai",
  "seed-budaya",
  "seed-sejarah",
  "seed-alam",
  "seed-kuliner",
  "pantai",
  "budaya",
  "sejarah",
  "alam",
  "kuliner",
  "santai",
  "belanja",
  "keluarga",
]);

const searchArgsSchema = z.object({
  keywords: z.string().trim().max(200).optional(),
  categories: z
    .array(z.string().trim().min(1).max(100))
    .max(10)
    .optional()
    .transform((v) => v?.map((s) => s.toLowerCase()).filter((s) => KNOWN_CATEGORY_SLUGS.has(s))),
});

const detailArgsSchema = z
  .object({
    destinationId: z.uuid().optional(),
    destinationIds: z.array(z.uuid()).min(1).max(20).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.destinationId) || Boolean(v.destinationIds?.length), {
    message: "destinationId required",
  });

export type ToolDeps = {
  searchDestinations: (input: { keywords?: string; categories?: string[] }) => Promise<unknown[]>;
  getDestinationDetails: (input: { destinationIds: string[] }) => Promise<unknown[]>;
  /** User's requested categories; used when the model sends none, so search never runs unfiltered. */
  defaultCategories?: string[];
};

export const toolDefinitions: AiToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_destinations",
      description: "Search active Padang destinations by keywords or known category slugs.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          keywords: { type: "string" },
          categories: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_destination_details",
      description: "Get details for active Padang destinations by destination id(s).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          destinationId: { type: "string", format: "uuid" },
          destinationIds: { type: "array", items: { type: "string", format: "uuid" } },
        },
      },
    },
  },
];

function safeRow(row: unknown) {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (r.isActive !== true || r.city !== "Padang") return null;
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    address: r.address ?? null,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    details: r.details ?? {},
    categories: Array.isArray(r.categories)
      ? r.categories.map((c) => {
          const cat = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
          return { id: cat.id, name: cat.name, slug: cat.slug };
        })
      : [],
    city: r.city,
    isActive: r.isActive,
  };
}

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(422, "TOOL_ARGS_INVALID", "Invalid tool arguments");
  return parsed.data;
}

export function createToolExecutor(deps: ToolDeps) {
  return async function executeTool(name: string, rawArgs: unknown): Promise<unknown> {
    if (name === "search_destinations") {
      const args = parse(searchArgsSchema, rawArgs);
      // shortcut: union model categories with the user's requested categories,
      // the model sometimes searches only one of several requested categories.
      const categories = [...new Set([...(args.categories ?? []), ...(deps.defaultCategories ?? [])])];
      const searchRows = async (cats: string[], keywords: string | null = args.keywords ?? null) => {
        const rows = await deps.searchDestinations({
          ...(keywords ? { keywords } : {}),
          ...(cats.length ? { categories: cats } : {}),
        });
        return rows.map(safeRow).filter(Boolean) as Array<Record<string, unknown>>;
      };
      // Vibe words ("sepi", "enak buat ngobrol") rarely appear in name/description.
      // If keyword matching finds nothing, retry on category filters alone, then unfiltered.
      const retryWithoutKeywords = async () => {
        if (!args.keywords) return [];
        const byCategory = categories.length ? await searchRows(categories, null) : [];
        return byCategory.length > 0 ? byCategory : searchRows([], null);
      };
      // Fan out per category and round-robin the results: a single OR query with
      // take 10 can return 10 rows of one category, starving the other request.
      if (categories.length > 1) {
        const perCat: Array<Array<Record<string, unknown>>> = [];
        for (const cat of categories) perCat.push(await searchRows([cat]));
        const merged: Array<Record<string, unknown>> = [];
        const seenIds = new Set<string>();
        const maxLen = Math.max(...perCat.map((l) => l.length));
        for (let i = 0; i < maxLen && merged.length < SEARCH_LIMIT; i++) {
          for (const list of perCat) {
            const row = list[i];
            const id = row && typeof row.id === "string" ? row.id : null;
            if (row && id && !seenIds.has(id)) {
              seenIds.add(id);
              merged.push(row);
              if (merged.length >= SEARCH_LIMIT) break;
            }
          }
        }
        return merged.length > 0 ? merged : retryWithoutKeywords();
      }
      const rows = await searchRows(categories);
      return rows.length > 0 ? rows.slice(0, SEARCH_LIMIT) : retryWithoutKeywords().then((r) => r.slice(0, SEARCH_LIMIT));
    }
    if (name === "get_destination_details") {
      const args = parse(detailArgsSchema, rawArgs);
      const ids = args.destinationIds ?? (args.destinationId ? [args.destinationId] : []);
      const rows = await deps.getDestinationDetails({ destinationIds: ids });
      return rows.map(safeRow).filter(Boolean);
    }
    throw new HttpError(422, "TOOL_UNKNOWN", "Unknown tool");
  };
}

export async function executeTool(name: string, rawArgs: unknown, deps: ToolDeps): Promise<unknown> {
  return createToolExecutor(deps)(name, rawArgs);
}

export function mergeDestinationRows(
  acc: Map<string, Record<string, unknown>>,
  result: unknown,
): Map<string, Record<string, unknown>> {
  if (!Array.isArray(result)) return acc;
  for (const item of result) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = row.id;
    if (typeof id === "string" && id.length > 0 && !acc.has(id)) {
      acc.set(id, row);
    }
  }
  return acc;
}
