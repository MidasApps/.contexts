import "server-only";
import {
  buildChatRoutes,
  buildConnectorsRoutes,
  buildFilesRoutes,
  buildKnowledgeDocumentsRoutes,
  buildKnowledgeSourcesRoutes,
  buildMcpRoutes,
  buildSchedulesRoutes,
  buildWorkflowRunsRoutes,
  buildWorkflowRunStreamRoutes,
  createCoreAgentCommandExecutors,
  createFirebaseAdmin,
  createFirebaseConnectorsServices,
  createFirebaseFilesServices,
  createFirestoreConversationsServices,
  createKnowledgeServices,
  createMastraChatGateway,
  createMastraGateway,
  createMastraWorkflowGateway,
  createMastraWorkflowApprovalSettler,
  createPostgresClient,
  createPostgresKnowledgeRepository,
  createServerlessIdTokenSource,
  processLogger,
  registerAgentCommandApprovals,
  registerWorkflowApprovals,
} from "@core/services";
import type { CoreRoutes, CoreServer } from "@core/services/composition";

// The model id only matters for search, which runs in Mastra; the web routes list, read and delete.
const UNUSED_SEARCH_MODEL = "web/no-search";

/**
 * `/v1` routes of the SP3 contexts that `createCoreServer` does not build: files (uploads,
 * SP3 Task 13), the knowledge base (documents over Postgres, sources through the Mastra
 * gateway, Task 14) and tenant connectors (Firestore + secret store, Task 21). They share
 * the core server's pipeline, audit writer and Admin SDK app, plus `POST /v1/mcp` (the core
 * MCP server through the Mastra gateway, Task 24) and the SP4 chat (`/v1/chat`). It also registers the SP1
 * approval handler of kind `agent-command` (decision 0025): approvals are decided here, so the
 * approved agent command runs here, at most once per `runId:toolCallId`. The `workflow-resume`
 * handler (decision 0036) settles approved workflow requests through the Mastra settle route.
 */
export const buildRuntimeRoutes = async (core: CoreServer): Promise<CoreRoutes> => {
  const { env, processEnvForFirebaseGuard } = await import("@/env");
  registerAgentCommandApprovals({
    approvals: core.approvals,
    executors: createCoreAgentCommandExecutors({ tenancy: core.tenancy, access: core.access }),
    access: core.access,
    idempotency: core.pipeline.idempotency,
  });
  const firebase = createFirebaseAdmin({ env, processEnv: processEnvForFirebaseGuard });
  const files = createFirebaseFilesServices({
    firebase,
    env: { APP_ENV: env.APP_ENV, FILES_BUCKET: env.FILES_BUCKET, FIREBASE_STORAGE_EMULATOR_HOST: env.FIREBASE_STORAGE_EMULATOR_HOST },
    logger: processLogger,
  });
  // postgres.js connects lazily; the web login role may SET ROLE knowledge_runtime (migration 0005).
  const knowledge = createKnowledgeServices({
    repository: createPostgresKnowledgeRepository(createPostgresClient({ DATABASE_URL: env.DATABASE_URL })),
    embeddingModel: UNUSED_SEARCH_MODEL,
  });
  const serverlessToken = env.APP_ENV === "local" || env.MASTRA_AUDIENCE === undefined ? null : createServerlessIdTokenSource({ audience: env.MASTRA_AUDIENCE });
  const gateway = createMastraGateway({ baseUrl: env.MASTRA_URL, serverlessToken });
  registerWorkflowApprovals({ approvals: core.approvals, settler: createMastraWorkflowApprovalSettler({ baseUrl: env.MASTRA_URL, serverlessToken }) });
  const gatewayOptions = { baseUrl: env.MASTRA_URL, serverlessToken };
  const connectors = createFirebaseConnectorsServices({
    firebase,
    env: { APP_ENV: env.APP_ENV, FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID },
    audit: core.audit,
    clock: core.pipeline.clock,
  });
  // SP5 workflow runs and tenant schedules (decisions 0037, 0040): custom Mastra routes with the caller's Bearer.
  const workflowGateway = createMastraWorkflowGateway({ baseUrl: env.MASTRA_URL, serverlessToken });
  const workflowDeps = { pipeline: core.pipeline, gateway: workflowGateway, resolveAccessContext: core.resolveAccessContext };
  const chatDeps = {
    pipeline: core.pipeline,
    chat: createMastraChatGateway(gatewayOptions),
    conversations: createFirestoreConversationsServices({ firestore: firebase.firestore, clock: core.pipeline.clock }),
    resolveAccessContext: core.resolveAccessContext,
    files: { getReadyFile: files.getReadyFile, readFileBytes: files.readFileBytes },
  };
  return {
    ...buildConnectorsRoutes({ pipeline: core.pipeline, connectors }),
    ...buildFilesRoutes({ pipeline: core.pipeline, files }),
    ...buildKnowledgeDocumentsRoutes({ pipeline: core.pipeline, knowledge }),
    ...buildKnowledgeSourcesRoutes({ pipeline: core.pipeline, gateway, getReadyFile: files.getReadyFile, resolveAccessContext: core.resolveAccessContext }),
    ...buildMcpRoutes({ pipeline: core.pipeline, gateway, resolveAccessContext: core.resolveAccessContext }),
    ...buildWorkflowRunsRoutes(workflowDeps),
    ...buildWorkflowRunStreamRoutes(workflowDeps),
    ...buildSchedulesRoutes(workflowDeps),
    // SP4 chat (decisions 0031-0033): conversation metadata in Firestore, the stream from Mastra.
    ...buildChatRoutes(chatDeps),
  };
};
