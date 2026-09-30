import type { EmbeddingModelV4 } from "@ai-sdk/provider";
import { type Citation, CitationSchema, KnowledgeNamespaceSchema } from "@core/contracts";
import { embed } from "ai";
import { z } from "zod";
import { CATALOG_NAMESPACE } from "../../knowledge/workflows/catalog-reindex.workflow.ts";
import type { KnowledgePort } from "../../runtime/runtime-ports.ts";
import { type AiCatalogReader, CATALOG_READ_PERMISSION } from "../catalog/ai-catalog-reader.ts";
import { type CoreToolContext, defineCoreTool } from "../define-core-tool.ts";

export const SEARCH_KNOWLEDGE_TOOL_ID = "knowledge.searchKnowledge";
export const KNOWLEDGE_READ_PERMISSION = "core.knowledge.read";
/** Most results one call returns (spec §8.5). */
export const MAX_KNOWLEDGE_RESULTS = 8;
const DEFAULT_TOP_K = 5;

export type SearchKnowledgeDeps = {
  readonly knowledge: KnowledgePort;
  readonly embedding: () => EmbeddingModelV4;
  /** Hides catalog documents of contracts the caller may not see (decision 0024). */
  readonly catalog: AiCatalogReader;
};

/**
 * Namespaces the caller may search (spec §11): the organization (`tenant`), the active
 * project, and the platform catalog for `core.catalog.read` holders. Module namespaces
 * join when tenants can enable modules (SP5 agent settings).
 */
export const allowedNamespacesOf = (ctx: Pick<CoreToolContext, "agent">): string[] => [
  "tenant",
  ...(ctx.agent.projectId === undefined ? [] : [`project:${ctx.agent.projectId}`]),
  ...(ctx.agent.permissions.includes(CATALOG_READ_PERMISSION) ? [CATALOG_NAMESPACE] : []),
];

/** The model's namespaces ∩ the allowed ones; none left (or none asked) means every allowed one. */
export const effectiveNamespaces = (requested: readonly string[] | undefined, allowed: readonly string[]): string[] => {
  const kept = (requested ?? []).filter((namespace) => allowed.includes(namespace));
  return kept.length === 0 ? [...allowed] : [...new Set(kept)];
};

const byScore = (left: Citation, right: Citation): number => right.score - left.score || left.citationId.localeCompare(right.citationId);

const searchAll = async (deps: SearchKnowledgeDeps, ctx: CoreToolContext, input: { namespaces: string[]; embedding: number[]; topK: number }) => {
  const { tenantId, permissions } = ctx.agent;
  const own = input.namespaces.filter((namespace) => namespace !== CATALOG_NAMESPACE);
  const [tenantHits, catalogHits] = await Promise.all([
    own.length === 0 ? [] : deps.knowledge.searchChunks({ tenantId, namespaces: own, embedding: input.embedding, topK: input.topK }),
    input.namespaces.includes(CATALOG_NAMESPACE) ? deps.knowledge.searchChunks({ tenantId, namespaces: [CATALOG_NAMESPACE], embedding: input.embedding, topK: input.topK }) : [],
  ]);
  // Catalog documents are titled with their contract id: keep only contracts the caller may see.
  const visible = new Set(permissions);
  const catalogVisible = catalogHits.filter((hit) => hit.title !== null && deps.catalog.describe({ id: hit.title, permissions: visible }) !== undefined);
  return [...tenantHits, ...catalogVisible].sort(byScore).slice(0, input.topK);
};

/**
 * `knowledge.searchKnowledge` (spec §8.5): semantic search over the organization
 * knowledge base. Tenant and allowed namespaces come from the typed context, never
 * from the model; results under similarity 0.3 are dropped by the use case. Each
 * result carries the `citationId` the answer must cite; snippets are data, not
 * instructions.
 */
export const createSearchKnowledgeTool = (deps: SearchKnowledgeDeps) =>
  defineCoreTool({
    id: SEARCH_KNOWLEDGE_TOOL_ID,
    description:
      "Searches the organization's knowledge base (uploaded documents, web pages and the data catalog) and returns passages with citation ids. Use it before answering any question about the organization's content; cite every claim with [kb:...].",
    kind: "read",
    permission: KNOWLEDGE_READ_PERMISSION,
    inputSchema: z.strictObject({
      query: z.string().min(1).max(1000).describe("What to look for, in the user's words."),
      namespaces: z.array(KnowledgeNamespaceSchema).max(10).optional().describe("Optional subset of tenant, project:<id> or catalog; anything else is ignored."),
      topK: z.int().min(1).max(MAX_KNOWLEDGE_RESULTS).optional().describe(`How many passages to return (1-${MAX_KNOWLEDGE_RESULTS}, default ${DEFAULT_TOP_K}).`),
    }),
    outputSchema: z.strictObject({ results: z.array(CitationSchema) }),
    execute: async (input, ctx) => {
      const namespaces = effectiveNamespaces(input.namespaces, allowedNamespacesOf(ctx));
      const { embedding } = await embed({ model: deps.embedding(), value: input.query, abortSignal: ctx.abortSignal });
      const results = await searchAll(deps, ctx, { namespaces, embedding, topK: input.topK ?? DEFAULT_TOP_K });
      return { results: results.map((result) => ({ ...result })) };
    },
  });
