import type { EmbeddingModelV4 } from "@ai-sdk/provider";
import { embedMany } from "ai";
import { EMBEDDING_DIMENSIONS } from "../models/model-roles.ts";

/** Chunks per embedding request (spec §11). */
export const EMBED_BATCH_SIZE = 64;

/** Deadline of one embedding batch, so a stuck provider call cannot hang the workflow step. */
export const EMBED_BATCH_TIMEOUT_MS = 60_000;

/** Version of the chunking + embedding recipe stored with each chunk (contracts/pgvector.md §4). */
export const EMBEDDING_VERSION = "v1-chunk2000-d1536";

/** The provider answered vectors of another size: storing them would corrupt `ai.chunks_v1`. */
export class EmbeddingDimensionError extends Error {
  readonly code = "EMBEDDING_DIMENSION_MISMATCH";

  constructor(actual: number) {
    super(`expected ${EMBEDDING_DIMENSIONS} dimensions, got ${actual}`);
    this.name = "EmbeddingDimensionError";
  }
}

/**
 * Embeds chunk texts in batches of 64, in order, one batch at a time (the
 * embedding role is pinned to 1536 dimensions by the model factory). Each batch has its own
 * deadline, combined with the caller's signal (workflow cancel).
 * @throws {EmbeddingDimensionError} when a vector is not 1536 finite numbers.
 */
export const embedChunks = async (input: {
  readonly model: EmbeddingModelV4;
  readonly texts: readonly string[];
  readonly abortSignal?: AbortSignal;
}): Promise<number[][]> => {
  const vectors: number[][] = [];
  for (let start = 0; start < input.texts.length; start += EMBED_BATCH_SIZE) {
    const deadline = AbortSignal.timeout(EMBED_BATCH_TIMEOUT_MS);
    const { embeddings } = await embedMany({
      model: input.model,
      values: input.texts.slice(start, start + EMBED_BATCH_SIZE),
      maxParallelCalls: 1,
      abortSignal: input.abortSignal === undefined ? deadline : AbortSignal.any([input.abortSignal, deadline]),
    });
    for (const vector of embeddings) {
      if (vector.length !== EMBEDDING_DIMENSIONS || !vector.every(Number.isFinite))
        throw new EmbeddingDimensionError(vector.length);
      vectors.push(vector);
    }
  }
  return vectors;
};
