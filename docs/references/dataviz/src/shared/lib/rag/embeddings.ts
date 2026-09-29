import { embedMany } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';
import { recordRagMetric } from './metrics';

export interface EmbedOptions {
  maxRetries?: number;
  batchSize?: number;
}

function getModel() {
  const provider = process.env.RAG_EMBEDDING_PROVIDER ?? 'vertex';
  const modelId = process.env.RAG_EMBEDDING_MODEL ?? 'gemini-embedding-001';
  if (provider === 'vertex') {
    return vertex.textEmbeddingModel(modelId);
  }
  if (provider === 'openai') {
    // Dynamic require keeps `@ai-sdk/openai` optional (ADR-0005). Webpack
    // magic comment evita resolução estática do Next.js — só carrega
    // quando o branch é tomado em runtime.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { openai } = require(/* webpackIgnore: true */ '@ai-sdk/openai');
    return openai.embedding('text-embedding-3-small');
  }
  throw new Error(`Unknown RAG_EMBEDDING_PROVIDER=${provider}`);
}

async function withRetry<T>(fn: () => Promise<T>, max = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < max; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 250 * 2 ** i));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function embedTexts(
  values: string[],
  opts: EmbedOptions = {},
): Promise<number[][]> {
  const batchSize = opts.batchSize ?? Number(process.env.RAG_INGEST_BATCH_SIZE ?? 20);
  const model = getModel();
  const out: number[][] = [];
  for (let i = 0; i < values.length; i += batchSize) {
    const slice = values.slice(i, i + batchSize);
    const t0 = Date.now();
    const { embeddings } = await withRetry(
      () => embedMany({ model, values: slice }),
      opts.maxRetries ?? 3,
    );
    out.push(...embeddings);
    recordRagMetric({
      event: 'embed.batch',
      durationMs: Date.now() - t0,
      count: slice.length,
    });
  }
  return out;
}
