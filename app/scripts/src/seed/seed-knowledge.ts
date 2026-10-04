import {
  AgentEnvSchema,
  createCatalogReindexWorkflow,
  createModelProvider,
  embeddingModelIdOf,
  indexDocumentText,
  type KnowledgeIndexingDeps,
  knowledgePortFromUseCases,
  resolveAgentEnv,
} from "@core/agents";
import {
  createKnowledgeServices,
  createPostgresClient,
  createPostgresKnowledgeRepository,
  loadServicesEnvWith,
} from "@core/services";

/** Two sample Markdown documents of the demo organization (generic, no business domain). */
export const SAMPLE_KNOWLEDGE_DOCUMENTS = [
  {
    sourceRef: "seed:getting-started",
    title: "Getting started",
    text: [
      "# Getting started",
      "Sign in with the owner account created by `pnpm seed:local`, open the organization and invite members from the Members page.",
      "## Asking the assistant",
      "The assistant answers from this knowledge base and cites its sources as kb markers. When no document supports an answer it says it is not sure.",
    ].join("\n\n"),
  },
  {
    sourceRef: "seed:roles-and-access",
    title: "Roles and access",
    text: [
      "# Roles and access",
      "Owners manage the organization and its billing. Admins manage members, roles and the knowledge base. Members use the workspace and read the knowledge base.",
      "## Uploading documents",
      "Admins upload Markdown, text, CSV, JSON or PDF files as knowledge documents; each upload is checked by content before it is indexed.",
    ].join("\n\n"),
  },
] as const;

/**
 * Seeds the knowledge base (SP3 Task 14): runs `catalog-reindex` in-process (platform
 * rows, no caller principal) and indexes the two sample documents for the demo
 * organization `tenantId` (the id the tenancy step seeded, decision 0022). Idempotent: a
 * second run finds every document unchanged.
 * @returns a one-line summary for the console.
 */
export const seedKnowledgeBase = async (
  deps: KnowledgeIndexingDeps & { readonly aiCatalog?: unknown },
  tenantId: string,
): Promise<string> => {
  const reindex = createCatalogReindexWorkflow(deps);
  // No request context: an in-process run carries no caller principal, which the workflow requires.
  const run = await (await reindex.createRun()).start({ inputData: {} });
  if (run.status !== "success" || run.result.status !== "done") throw new Error(`catalog-reindex ${run.status}`);
  let samplesIndexed = 0;
  for (const sample of SAMPLE_KNOWLEDGE_DOCUMENTS) {
    const outcome = await indexDocumentText(deps, {
      document: {
        tenantId,
        namespace: "tenant",
        source: "upload",
        sourceRef: sample.sourceRef,
        title: sample.title,
        sourceUrl: null,
        mimeType: "text/markdown",
        metadata: { seeded: true },
        createdBy: null,
      },
      text: sample.text,
      format: "markdown",
    });
    if (outcome.status === "indexed") samplesIndexed += 1;
  }
  const { total, indexed, unchanged } = run.result;
  return `catalog ${total} contracts (${indexed} indexed, ${unchanged} unchanged); samples for ${tenantId}: ${samplesIndexed} indexed, ${SAMPLE_KNOWLEDGE_DOCUMENTS.length - samplesIndexed} unchanged`;
};

/**
 * Builds the indexing dependencies from the local env: models of `AI_MODE` (fake
 * embeddings offline, the configured provider in real mode) and the Postgres knowledge
 * base. `close` ends the connection pool.
 * @throws {InvalidEnvError} naming the invalid variables (fail fast).
 */
export const createKnowledgeSeedDeps = (
  processEnv: Record<string, string | undefined>,
): { deps: KnowledgeIndexingDeps; close: () => Promise<void> } => {
  const env = resolveAgentEnv(loadServicesEnvWith(AgentEnvSchema, processEnv));
  const models = createModelProvider(env);
  const embeddingModelId = embeddingModelIdOf(env);
  const sql = createPostgresClient({ DATABASE_URL: env.DATABASE_URL }, { max: 2 });
  const knowledge = knowledgePortFromUseCases(
    createKnowledgeServices({ repository: createPostgresKnowledgeRepository(sql), embeddingModel: embeddingModelId }),
  );
  return { deps: { knowledge, embedding: models.embedding, embeddingModelId }, close: () => sql.end() };
};
