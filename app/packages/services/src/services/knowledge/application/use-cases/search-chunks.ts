import { type Citation, CitationSchema } from "@core/contracts";
import type { ChunkMatch, KnowledgeRepository } from "../ports/knowledge-repository.ts";
import { inputErrorOf, type KnowledgeInputError, type SearchChunksInput, SearchChunksInputSchema } from "./knowledge-input.schema.ts";

/** Matches below this similarity are noise, not evidence (`knowledge.Citation` contract). */
export const MIN_CITATION_SCORE = 0.3;
const MAX_SNIPPET_LENGTH = 4000;

export type SearchChunks = (input: SearchChunksInput) => Promise<{ ok: true; data: Citation[] } | { ok: false; error: KnowledgeInputError }>;

const toCitation = (match: ChunkMatch): Citation =>
  CitationSchema.parse({
    citationId: `kb:${match.documentId}#${match.chunkIndex}`,
    documentId: match.documentId,
    title: match.title,
    sourceUrl: match.sourceUrl,
    snippet: match.text.slice(0, MAX_SNIPPET_LENGTH),
    // Cosine similarity = 1 - distance; rounded so citations are stable across runs.
    score: Math.round(Math.min(1, Math.max(0, 1 - match.distance)) * 10_000) / 10_000,
  });

/**
 * Nearest chunks as citations (SP3 spec §11): only the tenant's rows and
 * `_platform` rows (row level security), only the given namespaces, only
 * vectors of the configured embedding model, weak matches dropped.
 * @param deps.embeddingModel the model id that produced the stored vectors (`AI_MODEL_EMBEDDING`).
 */
export const makeSearchChunks =
  (deps: { readonly repository: KnowledgeRepository; readonly embeddingModel: string }): SearchChunks =>
  async (input) => {
    const parsed = SearchChunksInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: inputErrorOf(parsed.error) };
    const matches = await deps.repository.searchChunks({ ...parsed.data, embeddingModel: deps.embeddingModel });
    return { ok: true, data: matches.map(toCitation).filter((citation) => citation.score >= MIN_CITATION_SCORE) };
  };
