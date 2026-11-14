# gpt-oss answerer + RAG implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded general_chat and missing_information replies with gpt-oss-120b generation backed by a DB-built embedding knowledge base, and send reasoning_effort on all AI calls.

**Architecture:** Three separable pieces. First, reasoning_effort travels on every chat completion, read per role from env with sensible defaults. Second, an answerer service and an embedding integration, both feature-isolated. Third, wire both into the chat service reply path and itinerary tool flow through injected deps, so chat never imports the destinations module and unit tests never load the ONNX model.

**Tech Stack:** Hono + Node.js + TypeScript, Vitest, `@huggingface/transformers` (feature-extraction, mean pooling, cosine), Groq (OpenAI-compatible).

## Global Constraints

- Node.js 24+, pnpm 11. After dependency changes run `pnpm install`.
- TypeScript imports are relative and end in `.js`.
- Feature modules must not import each other. Cross-feature code lives in `src/shared/`. Keep this boundary by injecting a `retrieveRagContext` dep instead of importing the destinations repository into chat.
- Validate at trust boundaries (Zod schemas already exist; do not weaken them).
- Test commands: `pnpm --filter api test:unit` (no DB), `pnpm --filter api test:integration` (needs migrated local DB), `pnpm --filter api check-types`, `pnpm --filter api lint`.
- Do not commit `.env`.
- Model contract: classifier `openai/gpt-oss-20b` with reasoning_effort `low`; tool and answerer `openai/gpt-oss-120b` with reasoning_effort `medium`. No temperature or max_tokens are sent, since gpt-oss ignores them and neither was requested.

---

## File Structure

- `apps/api/package.json` - add `@huggingface/transformers`.
- `apps/api/src/integrations/ai/schemas.ts` - add `reasoningEffort?` to `AiRoleConfig`.
- `apps/api/src/integrations/ai/chat-completions.ts` - read per-role reasoning_effort and send it.
- `apps/api/src/integrations/embedding/similarity.ts` - NEW, pure `cosineSimilarity`.
- `apps/api/src/integrations/embedding/embedding.ts` - NEW, ONNX pipeline wrapper `embed` / `embedBatch`.
- `apps/api/src/modules/chat/services/rag.ts` - NEW, chunk builder, top-K retrieval, lazy KB cache, context provider.
- `apps/api/src/modules/chat/services/answerer.ts` - NEW, `buildAnswererSystemPrompt` + `generateNaturalReply`.
- `apps/api/src/modules/chat/services/chat.service.ts` - wire answerer into reply path, inject RAG into tool flow.
- `apps/api/src/env.ts` - add embedding env vars.
- `apps/api/.env.example` - document reasoning_effort and embedding vars.
- `apps/api/src/routes.ts` - composite `retrieveRagContext` from the destinations table.
- Tests: `tests/unit/integrations/ai/chat-completions.test.ts`, `tests/unit/integrations/embedding/similarity.test.ts`, `tests/unit/features/chat/rag.test.ts`, `tests/unit/features/chat/answerer.test.ts`, `tests/integration/chat.answerer.test.ts`.

---

### Task 1: Add the transformers dependency

**Files:**
- Modify: `apps/api/package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `@huggingface/transformers` available to `embedding.ts`.

- [ ] **Step 1: Install the dependency**

```bash
pnpm --filter api add @huggingface/transformers
```

- [ ] **Step 2: Verify install**

Run: `pnpm install`
Expected: lockfile updated, no peer warnings.

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add @huggingface/transformers"
```

---

### Task 2: reasoning_effort on every AI call

**Files:**
- Modify: `apps/api/src/integrations/ai/schemas.ts`
- Modify: `apps/api/src/integrations/ai/chat-completions.ts`
- Test: `apps/api/tests/unit/integrations/ai/chat-completions.test.ts`

**Interfaces:**
- Consumes: `AiRoleConfig` (defined in schemas.ts).
- Produces: `AiRoleConfig.reasoningEffort?: string`, `resolveAiRoleConfig(role, source)` now returns `reasoningEffort`, `completeChat` sends `reasoning_effort` in the request body when set.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/tests/unit/integrations/ai/chat-completions.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api run vitest run tests/unit/integrations/ai/chat-completions.test.ts`
Expected: FAIL, `reasoningEffort` is `undefined`, expected `"low"`.

- [ ] **Step 3: Implement**

Edit `apps/api/src/integrations/ai/schemas.ts`, add a field to `AiRoleConfig`:

```ts
export type AiRoleConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  provider: string;
  reasoningEffort?: string;
};
```

Edit `apps/api/src/integrations/ai/chat-completions.ts`. Add a helper next to `pick`:

```ts
function pickEffort(raw: string | undefined, fallback: string): string {
  const value = (raw ?? "").trim();
  return value || fallback;
}
```

Change the two return statements in `resolveAiRoleConfig`. Classifier branch:

```ts
    return { baseUrl, apiKey, model, provider, reasoningEffort: pickEffort(source.AI_CLASSIFIER_REASONING_EFFORT, "low") };
```

Tool branch:

```ts
  return { baseUrl, apiKey, model, provider, reasoningEffort: pickEffort(source.AI_TOOL_REASONING_EFFORT, "medium") };
```

In `completeChat`, after the `body` literal add:

```ts
  if (input.config.reasoningEffort) body.reasoning_effort = input.config.reasoningEffort;
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter api test:unit`
Expected: PASS, all existing chat-completions tests still green (reasoning_effort is absent when unset, so old assertions hold).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/integrations/ai/schemas.ts apps/api/src/integrations/ai/chat-completions.ts apps/api/tests/unit/integrations/ai/chat-completions.test.ts
git commit -m "feat(api): send reasoning_effort per AI role"
```

---

### Task 3: Embedding integration

**Files:**
- Create: `apps/api/src/integrations/embedding/similarity.ts`
- Create: `apps/api/src/integrations/embedding/embedding.ts`
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/.env.example`
- Test: `apps/api/tests/unit/integrations/embedding/similarity.test.ts`

**Interfaces:**
- Consumes: `env.EMBEDDING_MODEL`, `env.EMBEDDING_TOP_K`, `env.EMBEDDING_SIMILARITY_THRESHOLD`.
- Produces:
  - `similarity.ts`: `export function cosineSimilarity(a: number[], b: number[]): number`
  - `embedding.ts`: `export type Embedding = number[]`, `export async function embed(text: string): Promise<Embedding>`, `export async function embedBatch(texts: string[]): Promise<Embedding[]>`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/unit/integrations/embedding/similarity.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "vitest";
import { cosineSimilarity } from "../../../../src/integrations/embedding/similarity.js";

test("identical vectors score 1", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
});

test("orthogonal vectors score 0", () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("known angle returns expected cosine", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0.707, 0.707]) - 0.707) < 0.01);
});

test("zero vector returns 0 instead of NaN", () => {
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api run vitest run tests/unit/integrations/embedding/similarity.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `apps/api/src/integrations/embedding/similarity.ts`:

```ts
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

Create `apps/api/src/integrations/embedding/embedding.ts`:

```ts
import { pipeline } from "@huggingface/transformers";
import { env } from "../../env.js";

export type Embedding = number[];

let extractor: Awaited<ReturnType<typeof pipeline>> | null = null;

async function initEmbeddingPipeline() {
  if (!extractor) {
    extractor = await pipeline("feature-extraction", env.EMBEDDING_MODEL);
  }
  return extractor;
}

export async function embed(text: string): Promise<Embedding> {
  const model = await initEmbeddingPipeline();
  const output = await model(text, { pooling: "mean", normalize: true });
  return output.tolist()[0];
}

export async function embedBatch(texts: string[]): Promise<Embedding[]> {
  const model = await initEmbeddingPipeline();
  const output = await model(texts, { pooling: "mean", normalize: true });
  return output.tolist();
}
```

Edit `apps/api/src/env.ts`, after `AI_TOOL_MAX_ROUNDS` add:

```ts
    EMBEDDING_MODEL: z.string().default("Xenova/paraphrase-multilingual-MiniLM-L12-v2"),
    EMBEDDING_TOP_K: z.coerce.number().int().min(1).max(20).default(3),
    EMBEDDING_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.3),
```

Edit `apps/api/.env.example`, after `AI_TOOL_MAX_ROUNDS=3` add:

```
AI_CLASSIFIER_REASONING_EFFORT=low
AI_TOOL_REASONING_EFFORT=medium
EMBEDDING_MODEL=Xenova/paraphrase-multilingual-MiniLM-L12-v2
EMBEDDING_TOP_K=3
EMBEDDING_SIMILARITY_THRESHOLD=0.3
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter api test:unit`
Expected: PASS similarity tests. `embedding.ts` is compiled but not exercised by unit tests, so no model is loaded.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/integrations/embedding apps/api/src/env.ts apps/api/.env.example apps/api/tests/unit/integrations/embedding
git commit -m "feat(api): add embedding pipeline and cosine similarity"
```

---

### Task 4: RAG chunking, retrieval, and knowledge base cache

**Files:**
- Create: `apps/api/src/modules/chat/services/rag.ts`
- Test: `apps/api/tests/unit/features/chat/rag.test.ts`

**Interfaces:**
- Consumes: `cosineSimilarity` from similarity.ts, `embed` / `embedBatch` / `Embedding` from embedding.ts, `env.EMBEDDING_TOP_K` and `env.EMBEDDING_SIMILARITY_THRESHOLD`.
- Produces:
  - `export type DestinationKbRow = { id: string; name: string; description?: string | null; address?: string | null; details?: unknown; categories?: Array<{ name?: string; slug?: string }> }`
  - `export function buildDestinationChunk(row: DestinationKbRow): string`
  - `export type KbChunk = { text: string; embedding: Embedding; destinationId: string; name: string }`
  - `export type RetrievedChunk = { similarity: number; text: string; destinationId: string; name: string }`
  - `export function findRelevantChunks(queryEmbedding: Embedding, kb: KbChunk[], topK?: number, threshold?: number): RetrievedChunk[]`
  - `export function makeRagContextProvider(loadRows: () => Promise<DestinationKbRow[]>): (query: string) => Promise<string>`
  - `export function resetKnowledgeBaseCache(): void`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/unit/features/chat/rag.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "vitest";
import { buildDestinationChunk, findRelevantChunks } from "../../../../src/modules/chat/services/rag.js";

test("buildDestinationChunk joins name, categories, address, description, details", () => {
  const chunk = buildDestinationChunk({
    id: "d1",
    name: "Pantai Air Manis",
    description: "Pantai dengan batu Malin Kundang",
    address: "Padang Selatan",
    categories: [{ name: "Pantai" }, { name: "Alam" }],
    details: { price: 10000 },
  });
  assert.ok(chunk.includes("Pantai Air Manis"));
  assert.ok(chunk.includes("Kategori: Pantai, Alam"));
  assert.ok(chunk.includes("Alamat: Padang Selatan"));
  assert.ok(chunk.includes("Deskripsi: Pantai dengan batu Malin Kundang"));
  assert.ok(chunk.includes('"price":10000'));
});

test("buildDestinationChunk omits empty fields", () => {
  const chunk = buildDestinationChunk({ id: "d2", name: "Sate Padang" });
  assert.equal(chunk, "Sate Padang");
});

test("findRelevantChunks returns top-K above threshold", () => {
  const kb = [
    { text: "a", embedding: [1, 0], destinationId: "1", name: "A" },
    { text: "b", embedding: [0, 1], destinationId: "2", name: "B" },
    { text: "c", embedding: [0.707, 0.707], destinationId: "3", name: "C" },
  ];
  const hits = findRelevantChunks([1, 0], kb, 2, 0.5);
  assert.deepEqual(hits.map((h) => h.name), ["A", "C"]);
});

test("findRelevantChunks falls back to best single when none pass threshold", () => {
  const kb = [
    { text: "a", embedding: [1, 0], destinationId: "1", name: "A" },
    { text: "b", embedding: [0, 1], destinationId: "2", name: "B" },
  ];
  const hits = findRelevantChunks([0.9, 0.9], kb, 3, 0.99);
  assert.deepEqual(hits.map((h) => h.name), ["A"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api run vitest run tests/unit/features/chat/rag.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/chat/services/rag.ts`:

```ts
import { cosineSimilarity } from "../../../integrations/embedding/similarity.js";
import { embed, embedBatch, type Embedding } from "../../../integrations/embedding/embedding.js";
import { env } from "../../../env.js";

export type DestinationKbRow = {
  id: string;
  name: string;
  description?: string | null;
  address?: string | null;
  details?: unknown;
  categories?: Array<{ name?: string; slug?: string }>;
};

export function buildDestinationChunk(row: DestinationKbRow): string {
  const cats = (row.categories ?? []).map((c) => c.name).filter(Boolean).join(", ");
  const details = row.details != null ? (typeof row.details === "string" ? row.details : JSON.stringify(row.details)) : "";
  return [
    row.name,
    cats && `Kategori: ${cats}`,
    row.address && `Alamat: ${row.address}`,
    row.description && `Deskripsi: ${row.description}`,
    details && `Detail: ${details}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export type KbChunk = { text: string; embedding: Embedding; destinationId: string; name: string };

export type RetrievedChunk = { similarity: number; text: string; destinationId: string; name: string };

export function findRelevantChunks(
  queryEmbedding: Embedding,
  kb: KbChunk[],
  topK: number = env.EMBEDDING_TOP_K,
  threshold: number = env.EMBEDDING_SIMILARITY_THRESHOLD,
): RetrievedChunk[] {
  const scored = kb.map((c) => ({
    similarity: cosineSimilarity(queryEmbedding, c.embedding),
    text: c.text,
    destinationId: c.destinationId,
    name: c.name,
  }));
  scored.sort((a, b) => b.similarity - a.similarity);
  const above = scored.filter((s) => s.similarity >= threshold);
  const picked = above.length > 0 ? above : scored.slice(0, 1);
  return picked.slice(0, topK);
}

let kbCache: KbChunk[] | null = null;

export function resetKnowledgeBaseCache(): void {
  kbCache = null;
}

// shortcut: cache is built once and lives until process restart; rebuild on demand by clearing cache or restarting.
export async function getKnowledgeBase(loadRows: () => Promise<DestinationKbRow[]>): Promise<KbChunk[]> {
  if (kbCache) return kbCache;
  const rows = await loadRows();
  const texts = rows.map(buildDestinationChunk);
  const embeddings = await embedBatch(texts);
  kbCache = rows.map((row, i) => ({
    text: texts[i]!,
    embedding: embeddings[i]!,
    destinationId: row.id,
    name: row.name,
  }));
  return kbCache;
}

export async function retrieveRelevantChunks(query: string, kb: KbChunk[]): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embed(query);
  return findRelevantChunks(queryEmbedding, kb);
}

export function makeRagContextProvider(loadRows: () => Promise<DestinationKbRow[]>): (query: string) => Promise<string> {
  return async (query) => {
    const kb = await getKnowledgeBase(loadRows);
    const chunks = await retrieveRelevantChunks(query, kb);
    if (chunks.length === 0) return "";
    return JSON.stringify(chunks.map((c) => ({ name: c.name, text: c.text })), null, 2);
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter api test:unit`
Expected: PASS rag tests. `getKnowledgeBase` and `makeRagContextProvider` touch the model and are not unit tested; they are covered by the integration test in Task 6 and a manual run.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chat/services/rag.ts apps/api/tests/unit/features/chat/rag.test.ts
git commit -m "feat(api): add RAG chunk builder and top-K retrieval"
```

---

### Task 5: Answerer service

**Files:**
- Create: `apps/api/src/modules/chat/services/answerer.ts`
- Test: `apps/api/tests/unit/features/chat/answerer.test.ts`

**Interfaces:**
- Consumes: `completeChat`, `resolveAiRoleConfig`, `AiMessage`, `AiRoleConfig`, `appendLog`.
- Produces:
  - `export function buildAnswererSystemPrompt(knowledgeBase: string, hint?: string): string`
  - `export async function generateNaturalReply(deps: AnswererDeps, input: { userMessage: string; history: AiMessage[]; hint?: string }): Promise<{ message: string; usage: { inputTokens?: number; outputTokens?: number } }>`
  - `export type AnswererDeps = { completeAiChat?: typeof completeChat; retrieveRagContext?: (query: string) => Promise<string>; resolveConfig?: () => AiRoleConfig }`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/unit/features/chat/answerer.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api run vitest run tests/unit/features/chat/answerer.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/chat/services/answerer.ts`:

```ts
import { completeChat, resolveAiRoleConfig } from "../../../integrations/ai/chat-completions.js";
import type { AiMessage, AiRoleConfig } from "../../../integrations/ai/schemas.js";
import { appendLog } from "../../../shared/logging/file-logger.js";

export type AnswererDeps = {
  completeAiChat?: typeof completeChat;
  retrieveRagContext?: (query: string) => Promise<string>;
  resolveConfig?: () => AiRoleConfig;
};

export function buildAnswererSystemPrompt(knowledgeBase: string, hint?: string): string {
  const kb = knowledgeBase
    ? `\n\nKnowledge base of Kota Padang destinations (the only source of destination facts):\n${knowledgeBase}\n`
    : "";
  const hintLine = hint ? `\n\nInstruction: ${hint}\n` : "";
  return `You are Lahlah, a travel assistant for Kota Padang.${kb}${hintLine}
Reply entirely in Indonesian. Keep responses singkat, ramah, and to the point, suitable for a chat window. When naming destinations, use only destinations present in the knowledge base; do not invent names. If the question is not about Kota Padang travel, politely decline and redirect to Padang travel topics.`;
}

const FALLBACK = "Halo! Saya bisa bantu menyusun itinerary satu hari di Kota Padang. Sebutkan kategori wisata yang kamu suka, misalnya pantai, kuliner, atau alam.";

export async function generateNaturalReply(
  deps: AnswererDeps,
  input: { userMessage: string; history: AiMessage[]; hint?: string },
): Promise<{ message: string; usage: { inputTokens?: number; outputTokens?: number } }> {
  const run = deps.completeAiChat ?? completeChat;
  const config = deps.resolveConfig ? deps.resolveConfig() : resolveAiRoleConfig("tool");

  let kbJson = "";
  if (deps.retrieveRagContext) {
    try {
      kbJson = await deps.retrieveRagContext(input.userMessage);
    } catch {
      kbJson = "";
    }
  }

  const systemPrompt = buildAnswererSystemPrompt(kbJson, input.hint);
  try {
    const result = await run({
      role: "tool",
      config,
      messages: [
        { role: "system", content: systemPrompt },
        ...input.history,
        { role: "user", content: input.userMessage },
      ],
    });
    const text = result.content?.trim();
    if (!text) return { message: FALLBACK, usage: {} };
    return {
      message: text,
      usage: result.usage ? { inputTokens: result.usage.promptTokens, outputTokens: result.usage.completionTokens } : {},
    };
  } catch (err) {
    appendLog("chat", {
      kind: "answerer_error",
      input: input.userMessage,
      error: err instanceof Error ? err.message : String(err),
    });
    return { message: FALLBACK, usage: {} };
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter api test:unit`
Expected: PASS answerer tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chat/services/answerer.ts apps/api/tests/unit/features/chat/answerer.test.ts
git commit -m "feat(api): add gpt-oss answerer for natural replies"
```

---

### Task 6: Wire answerer and RAG into the chat service and routes

**Files:**
- Modify: `apps/api/src/modules/chat/services/chat.service.ts`
- Modify: `apps/api/src/routes.ts`
- Test: `apps/api/tests/integration/chat.answerer.test.ts`

**Interfaces:**
- Consumes: `generateNaturalReply` from answerer.ts, `makeRagContextProvider` from rag.ts.
- Produces:
  - `ChatDeps.retrieveRagContext?: (query: string) => Promise<string>` (new optional dep)
  - `general_chat` and `missing_information` replies now come from `generateNaturalReply`
  - itinerary tool flow gets a `system` message carrying relevant chunks when `retrieveRagContext` yields a non-empty string.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integration/chat.answerer.test.ts`:

```ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, test } from "vitest";
import { prisma } from "../../src/db/client.js";
import { createChatService } from "../../src/modules/chat/index.js";
import { createItineraryService } from "../../src/modules/itinerary/index.js";
import * as usersRepository from "../../src/modules/users/repositories/users.repository.js";

const PREV_NODE_ENV = process.env.NODE_ENV;
const createdUserIds: string[] = [];

async function cleanupUser(userId: string) {
  await prisma.itineraryStop.deleteMany({ where: { version: { itinerary: { userId } } } });
  await prisma.itineraryVersion.deleteMany({ where: { itinerary: { userId } } });
  await prisma.destinationCheckpoint.deleteMany({ where: { itineraryDestination: { itinerary: { userId } } } });
  await prisma.itineraryDestination.deleteMany({ where: { itinerary: { userId } } });
  await prisma.itinerary.deleteMany({ where: { userId } });
  await prisma.chatMessage.deleteMany({ where: { session: { userId } } });
  await prisma.chatSession.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

beforeAll(() => {
  process.env.NODE_ENV = "test";
});

afterAll(async () => {
  for (const userId of createdUserIds) await cleanupUser(userId);
  if (PREV_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = PREV_NODE_ENV;
});

async function makeUser() {
  const user = await prisma.user.create({
    data: { name: "Answerer", email: `answerer-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "answerer-fixture" } },
    update: {},
    create: { provider: "test", modelIdentifier: "answerer-fixture", name: "answerer-fixture", isActive: true },
    select: { id: true },
  });
  return { user, model };
}

test("general_chat stores the generated natural reply", async () => {
  const { user, model } = await makeUser();
  const findUserById = async (id: string) =>
    usersRepository.findUserById(id).then((u) => (u ? { id: u.id, isActive: u.isActive } : null));

  const chat = createChatService({
    findUserById,
    itinerary: createItineraryService({ findUserById }),
    retrieveRagContext: async () => '[{"name":"Pantai Air Manis","text":"pantai"}]',
    classifyMessage: async () => ({ intent: "general_chat", source: "rule" as const }),
    completeAiChat: async () => ({
      content: "Saya bisa bantu susun itinerary Padang.",
      toolCalls: [],
      finishReason: "stop",
      usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
    }),
    searchDestinations: async () => [],
    getDestinationDetails: async () => [],
  });

  const session = await chat.createSession({ userId: user.id, title: "answerer" });
  const result = await chat.sendMessage({ userId: user.id, sessionId: session.data.id, content: "halo" });

  assert.equal(result.data.intent, "general_chat");
  assert.equal(result.data.message, "Saya bisa bantu susun itinerary Padang.");
  assert.equal(result.data.version, null);
});
```

Run it with a migrated local DB via the integration harness at the end of the task (see Step 4).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api test:integration -- chat.answerer`
Expected: FAIL. `general_chat` still returns the hardcoded greeting, so `result.data.message` does not equal the generated reply.

- [ ] **Step 3: Implement**

Edit `apps/api/src/modules/chat/services/chat.service.ts`.

Add the answerer import after the classifier import (line 6):

```ts
import { generateNaturalReply } from "./answerer.js";
```

Add the new dep to `ChatDeps` (after `completeAiChat`, line 30):

```ts
  retrieveRagContext?: (query: string) => Promise<string>;
```

In `runItineraryToolFlow`, replace the `messages` construction (lines 401-404) with:

```ts
  let ragText = "";
  if (input.deps.retrieveRagContext) {
    try {
      ragText = await input.deps.retrieveRagContext(input.userMessage);
    } catch {
      ragText = "";
    }
  }
  const messages: AiMessage[] = [
    ...input.history,
    ...(ragText ? [{ role: "system" as const, content: `Destinasi relevan (jadikan petunjuk, tetap panggil tool untuk data final):\n${ragText}` }] : []),
    { role: "user", content: `User request (Padang, single day): ${input.userMessage}\nUse tools to fetch destinations. Required categories: ${input.request.categories.join(", ")}.` },
  ];
```

Replace the `general_chat` / `missing_information` branches (lines 755-760) with:

```ts
    } else {
      const hint = intent === "general_chat" ? undefined : "Beberapa detail perjalanan belum lengkap (kategori, tanggal, atau jam). Tanyakan detail yang kurang dengan ramah.";
      if (intent !== "general_chat") intent = "missing_information";
      const answer = await generateNaturalReply(deps, {
        userMessage: input.content,
        history: input.history,
        hint,
      });
      message = answer.message;
      usage.inputTokens = (usage.inputTokens ?? 0) + (answer.usage.inputTokens ?? 0);
      usage.outputTokens = (usage.outputTokens ?? 0) + (answer.usage.outputTokens ?? 0);
    }
```

Edit `apps/api/src/routes.ts`.

Add the rag import next to the chat import (line 3):

```ts
import { makeRagContextProvider } from "./modules/chat/services/rag.js";
```

Add a `knowledgeBaseRows` loader before `createChatService` (near line 44) and pass the provider into `chatService`:

```ts
const knowledgeBaseRows = async () => {
  const rows = await prisma.destination.findMany({
    where: { city: "Padang", isActive: true },
    select: toolSelect,
  });
  return rows.map(toToolRow);
};

const chatService = createChatService({
  itinerary: itineraryService,
  findUserById: (id) => usersRepository.findUserById(id).then((u) => (u ? { id: u.id, isActive: u.isActive } : null)),
  retrieveRagContext: makeRagContextProvider(knowledgeBaseRows),
  searchDestinations: async (input) => {
    // existing body, unchanged
  },
  getDestinationDetails: async (input) => {
    // existing body, unchanged
  },
});
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter api test:unit`
Run: `pnpm --filter api test:integration -- chat.answerer`
Run: `pnpm --filter api check-types`
Expected: all PASS. Integration requires a migrated local DB (see `docs/api-development.md`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chat/services/chat.service.ts apps/api/src/routes.ts apps/api/tests/integration/chat.answerer.test.ts
git commit -m "feat(api): generate general_chat replies and inject RAG into chat"
```

---

## Final verification

- [ ] `pnpm --filter api test:unit`
- [ ] `pnpm --filter api test:integration` (migrated local DB required)
- [ ] `pnpm --filter api check-types`
- [ ] `pnpm --filter api lint`
- [ ] `pnpm --filter api build`
- [ ] Manual smoke: `pnpm --filter api dev`, then send a `general_chat` and an itinerary message and confirm the answerer and RAG context appear. Confirm the ONNX model downloads once and is reused.

## Self-review notes

- Spec coverage: reasoning_effort is Task 2, the natural answerer is Task 5, and RAG for general_chat plus itinerary context is Task 4 plus Task 6. All three requested items map to tasks.
- Placeholder scan: no TBD or similar remains; every code step carries its full body.
- Type consistency: `DestinationKbRow`, `KbChunk`, `RetrievedChunk`, `AnswererDeps`, and `returned` shapes are identical between implementation and tests. `ChatDeps.retrieveRagContext` matches the `AnswererDeps.retrieveRagContext` signature.
- Deliberate simplification: the model-driving functions `embed`, `embedBatch`, `getKnowledgeBase`, and `makeRagContextProvider` are not unit tested because they require the ONNX runtime and network model download. They are exercised by the Task 6 integration test only through injected `retrieveRagContext`, so a real end-to-end embedding pass still needs one manual run. Documented by the `shortcut:` comment in `rag.ts`.