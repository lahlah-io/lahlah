import { pipeline, env as transformersEnv, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { env } from "../../env.js";

export type Embedding = number[];

let extractor: FeatureExtractionPipeline | null = null;

// Biarkan operator menaruh model di cache persisten agar cold-start tidak mengunduh ulang.
transformersEnv.cacheDir = process.env.TRANSFORMERS_CACHE || transformersEnv.cacheDir;

async function initEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    extractor = (await pipeline("feature-extraction", env.EMBEDDING_MODEL)) as FeatureExtractionPipeline;
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
  const embeddings: Embedding[] = [];
  for (let i = 0; i < texts.length; i += 8) {
    const output = await model(texts.slice(i, i + 8), { pooling: "mean", normalize: true });
    embeddings.push(...output.tolist());
  }
  return embeddings;
}
