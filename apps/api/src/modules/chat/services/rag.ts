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

export type KbChunk = { text: string; embedding: Embedding; destinationId: string; name: string; categorySlugs: string[] };

export type RetrievedChunk = { similarity: number; text: string; destinationId: string; name: string };

export function findRelevantChunks(
  queryEmbedding: Embedding,
  kb: KbChunk[],
  topK: number = env.EMBEDDING_TOP_K,
  threshold: number = env.EMBEDDING_SIMILARITY_THRESHOLD,
  categorySlugs: string[] = [],
  fallbackMin: number = env.EMBEDDING_FALLBACK_MIN_SIMILARITY,
  excludedSlugs: string[] = [],
): RetrievedChunk[] {
  const available = excludedSlugs.length > 0 ? kb.filter((c) => !c.categorySlugs.some((slug) => excludedSlugs.includes(slug))) : kb;
  const scoped = categorySlugs.length > 0 ? available.filter((c) => c.categorySlugs.some((slug) => categorySlugs.includes(slug))) : available;
  const pool = scoped.length > 0 ? scoped : available;
  const scored = pool.map((c) => ({
    similarity: cosineSimilarity(queryEmbedding, c.embedding),
    text: c.text,
    destinationId: c.destinationId,
    name: c.name,
  }));
  scored.sort((a, b) => b.similarity - a.similarity);
  const hits = scored.filter((s) => s.similarity >= threshold).slice(0, topK);
  if (hits.length > 0) return hits;
  // Fallback top-1 hanya bila masih relevan; di bawah floor ini konteks kosong lebih baik daripada mengarang.
  const best = scored[0];
  return best && best.similarity >= fallbackMin ? [best] : [];
}

let kbCache: KbChunk[] | null = null;

export function resetKnowledgeBaseCache(): void {
  kbCache = null;
}

// shortcut: cache is built once and lives until process restart; rebuild on demand by clearing cache or restarting.
export async function getKnowledgeBase(loadRows: () => Promise<DestinationKbRow[]>): Promise<KbChunk[]> {
  if (kbCache) return kbCache;
  const rows = await loadRows();
  if (rows.length === 0) {
    kbCache = [];
    return kbCache;
  }
  const texts = rows.map(buildDestinationChunk);
  const embeddings = await embedBatch(texts);
  kbCache = rows.map((row, i) => ({
    text: texts[i]!,
    embedding: embeddings[i]!,
    destinationId: row.id,
    name: row.name,
    categorySlugs: (row.categories ?? []).map((c) => c.slug).filter((s): s is string => Boolean(s)),
  }));
  return kbCache;
}

export async function retrieveRelevantChunks(
  query: string,
  kb: KbChunk[],
  categorySlugs: string[] = [],
  excludedSlugs: string[] = [],
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embed(query);
  return findRelevantChunks(queryEmbedding, kb, undefined, undefined, categorySlugs, undefined, excludedSlugs);
}

export function makeRagContextProvider(
  loadRows: () => Promise<DestinationKbRow[]>,
  categoriesFor: (query: string) => string[] = () => [],
  exclusionsFor: (query: string) => string[] = () => [],
): (query: string) => Promise<string> {
  return async (query) => {
    if (env.NODE_ENV === "test") return "";
    const kb = await getKnowledgeBase(loadRows);
    const chunks = await retrieveRelevantChunks(query, kb, categoriesFor(query), exclusionsFor(query));
    if (chunks.length === 0) return "";
    return JSON.stringify(chunks.map((c) => ({ name: c.name, text: c.text })), null, 2);
  };
}
