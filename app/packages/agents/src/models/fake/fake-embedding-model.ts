import { createHash } from "node:crypto";
import type { EmbeddingModelV4 } from "@ai-sdk/provider";
import { EMBEDDING_DIMENSIONS } from "../model-roles.ts";
import { deferred } from "./deferred.ts";

/** Same dimension as the real embedding role (decision 0022). */
export const FAKE_EMBEDDING_DIMENSIONS = EMBEDDING_DIMENSIONS;

const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;

const tokenize = (text: string): string[] => text.toLowerCase().match(TOKEN_PATTERN) ?? [];

const bucketOf = (token: string, dimensions: number): number =>
  createHash("sha256").update(token).digest().readUInt32BE(0) % dimensions;

/**
 * Hashed bag of words: token → SHA-256 bucket, sublinear tf weight, L2-normalized.
 * Texts that share words point the same way, so retrieval stays meaningful.
 */
export const embedFakeText = (text: string, dimensions = FAKE_EMBEDDING_DIMENSIONS): number[] => {
  const counts = new Map<number, number>();
  for (const token of tokenize(text)) {
    const bucket = bucketOf(token, dimensions);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const vector = new Array<number>(dimensions).fill(0);
  // Empty text still gets a unit vector, so cosine similarity never divides by zero.
  if (counts.size === 0) vector[0] = 1;
  for (const [bucket, count] of counts) vector[bucket] = 1 + Math.log(count);
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return vector.map((value) => value / norm);
};

/** Deterministic `EmbeddingModelV4` for `AI_MODE=fake`. */
export const createFakeEmbeddingModel = (dimensions = FAKE_EMBEDDING_DIMENSIONS): EmbeddingModelV4 => ({
  specificationVersion: "v4",
  provider: "fake",
  modelId: "fake-embedding",
  maxEmbeddingsPerCall: 2048,
  supportsParallelCalls: true,
  doEmbed: ({ values }) =>
    deferred(() => ({
    embeddings: values.map((value) => embedFakeText(value, dimensions)),
    usage: { tokens: values.reduce((sum, value) => sum + tokenize(value).length, 0) },
    warnings: [],
  })),
});
