import { PLATFORM_TENANT_ID } from "@core/contracts";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { AGENT_PRINCIPAL_KEY } from "../../context/agent-request-context.ts";
import { loadBundledAiCatalog } from "../../tools/catalog/ai-catalog-source.ts";
import { indexDocumentText, type KnowledgeIndexingDeps } from "../index-document.ts";

export const CATALOG_REINDEX_WORKFLOW_ID = "catalog-reindex";
/** Namespace of platform catalog documents (decision 0022 amendment). */
export const CATALOG_NAMESPACE = "catalog";

const FieldSchema = z.object({ name: z.string(), description: z.string(), pii: z.string(), required: z.boolean() });
const EntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  context: z.string(),
  kind: z.string(),
  description: z.string(),
  tenancyScope: z.string(),
  permission: z.string().optional(),
  relations: z.array(z.object({ field: z.string(), target: z.string(), type: z.string() })),
  fields: z.array(FieldSchema),
});
const CatalogSchema = z.object({ contracts: z.array(EntrySchema) });
type CatalogEntry = z.infer<typeof EntrySchema>;

export const CatalogReindexResultSchema = z.strictObject({
  status: z.enum(["done", "failed"]),
  total: z.int().min(0),
  indexed: z.int().min(0),
  unchanged: z.int().min(0),
  code: z.string().nullable(),
});
export type CatalogReindexResult = z.infer<typeof CatalogReindexResultSchema>;

/**
 * The indexed text of a contract: what it is and its fields, never examples or
 * `sensitive` fields. The title is the contract id, so `searchKnowledge` can hide
 * contracts the caller may not see (decision 0024).
 */
export const renderContractDocument = (entry: CatalogEntry): string => {
  const fields = entry.fields
    .filter((field) => field.pii !== "sensitive")
    .map((field) => `- \`${field.name}\` (${field.required ? "required" : "optional"}): ${field.description}`);
  const relations = entry.relations.map((relation) => `- \`${relation.field}\` ${relation.type} ${relation.target}`);
  return [
    `# ${entry.name} (${entry.id})`,
    entry.description,
    `Kind: ${entry.kind}. Context: ${entry.context}. Tenancy: ${entry.tenancyScope}.${entry.permission === undefined ? "" : ` Permission: ${entry.permission}.`}`,
    ...(fields.length === 0 ? [] : ["## Fields", ...fields]),
    ...(relations.length === 0 ? [] : ["## Relations", ...relations]),
  ].join("\n\n");
};

/** `aiCatalog` defaults to the bundled `catalog.ai.json`. */
type ReindexDeps = KnowledgeIndexingDeps & { readonly aiCatalog?: unknown };

const reindexAll = async (deps: ReindexDeps, abortSignal: AbortSignal | undefined): Promise<CatalogReindexResult> => {
  const { contracts } = CatalogSchema.parse(deps.aiCatalog ?? loadBundledAiCatalog());
  let indexed = 0;
  let unchanged = 0;
  for (const entry of contracts) {
    const outcome = await indexDocumentText(deps, {
      document: {
        tenantId: PLATFORM_TENANT_ID,
        namespace: CATALOG_NAMESPACE,
        source: "catalog",
        sourceRef: entry.id,
        title: entry.id,
        sourceUrl: null,
        mimeType: "text/markdown",
        metadata: { contractId: entry.id, permission: entry.permission ?? null },
        createdBy: null,
      },
      text: renderContractDocument(entry),
      format: "markdown",
      ...(abortSignal === undefined ? {} : { abortSignal }),
    });
    if (outcome.status === "indexed") indexed += 1;
    if (outcome.status === "unchanged") unchanged += 1;
  }
  return { status: "done", total: contracts.length, indexed, unchanged, code: null };
};

/**
 * `catalog-reindex` (SP3 spec §11): one `_platform` document per AI-catalog contract
 * in namespace `catalog`; unchanged contracts are skipped. It writes platform rows,
 * so it runs only in-process (deploy, `pnpm seed:local`, the SP5 scheduler): a run
 * started through the HTTP API carries a caller principal and is refused.
 */
export const createCatalogReindexWorkflow = (deps: ReindexDeps) => {
  const reindex = createStep({
    id: "reindex-contracts",
    description: "Indexes every AI-catalog contract as a platform knowledge document.",
    inputSchema: z.strictObject({}),
    outputSchema: CatalogReindexResultSchema,
    execute: async ({ requestContext, abortSignal }) => {
      if (requestContext.get(AGENT_PRINCIPAL_KEY) !== undefined)
        return { status: "failed" as const, total: 0, indexed: 0, unchanged: 0, code: "PLATFORM_ONLY" };
      return reindexAll(deps, abortSignal);
    },
  });
  return createWorkflow({
    id: CATALOG_REINDEX_WORKFLOW_ID,
    description: "Rebuilds the platform catalog documents of the knowledge base.",
    inputSchema: z.strictObject({}),
    outputSchema: CatalogReindexResultSchema,
    retryConfig: { attempts: 3, delay: 2000 },
  })
    .then(reindex)
    .commit();
};
