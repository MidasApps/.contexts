import "server-only";
import {
  buildAdminFlagsRoutes,
  buildAdminImpersonationRoutes,
  buildAdminLogsRoutes,
  buildAdminOperationsRoutes,
  buildAdminPlatformRoutes,
  buildAdminUsersRoutes,
  buildAgentSettingsRoutes,
  buildFeedbackRoutes,
  buildObservabilityRoutes,
  buildPromptRoutes,
  buildChatRoutes,
  buildFlagsRoutes,
  buildConnectorsRoutes,
  buildConversationsRoutes,
  buildFilesRoutes,
  buildKnowledgeDocumentsRoutes,
  buildKnowledgeSourcesRoutes,
  buildMcpRoutes,
  buildSchedulesRoutes,
  buildTenantCatalogRoutes,
  buildUsageRoutes,
  buildVoiceRoutes,
  buildWorkflowRunsRoutes,
  buildWorkflowRunStreamRoutes,
  createCoreAgentCommandExecutors,
  createFirebaseAdmin,
  createFirestoreAdminUserDirectory,
  createFirebaseConnectorsServices,
  createFirebaseFilesServices,
  createFirebaseConsoleServices,
  createFirebaseFlagsServices,
  createFirestoreMessageFeedbackStore,
  createMastraConsoleGateway,
  createFirestoreConnectorRepository,
  createMastraOperationsGateway,
  createObservabilityServices,
  createPostgresPromptServices,
  createPostgresTraceCosts,
  createPostgresUsageRepository,
  createUsageServices,
  flagEnvironmentDefaults,
  createFirestoreConversationsServices,
  createKnowledgeServices,
  createMastraChatGateway,
  createMastraGateway,
  createMastraVoiceGateway,
  createMastraWorkflowGateway,
  createMastraWorkflowApprovalSettler,
  createPostgresClient,
  createPostgresKnowledgeRepository,
  createServerlessIdTokenSource,
  processLogger,
  readProcessLogBuffer,
  registerAgentCommandApprovals,
  registerWorkflowApprovals,
} from "@core/services";
import type { CoreRoutes, CoreServer } from "@core/services/composition";
import { createModuleCommands } from "./modules";

// The model id only matters for search, which runs in Mastra; the web routes list, read and delete.
const UNUSED_SEARCH_MODEL = "web/no-search";

/**
 * `/v1` routes of the SP3 contexts that `createCoreServer` does not build: files (uploads,
 * SP3 Task 13), the knowledge base (documents over Postgres, sources through the Mastra
 * gateway, Task 14) and tenant connectors (Firestore + secret store, Task 21). They share
 * the core server's pipeline, audit writer and Admin SDK app, plus `POST /v1/mcp` (the core
 * MCP server through the Mastra gateway, Task 24) and the SP4 chat (`/v1/chat`,
 * `/v1/conversations`, `/v1/voice`). It also registers the SP1
 * approval handler of kind `agent-command` (decision 0025): approvals are decided here, so the
 * approved agent command runs here, at most once per `runId:toolCallId`. The `workflow-resume`
 * handler (decision 0036) settles approved workflow requests through the Mastra settle route.
 */
export const buildRuntimeRoutes = async (core: CoreServer): Promise<CoreRoutes> => {
  const { env, processEnvForFirebaseGuard } = await import("@/env");
  const firebase = createFirebaseAdmin({ env, processEnv: processEnvForFirebaseGuard });
  // The command registry: core commands plus the installed modules' (SP3 Task 19).
  registerAgentCommandApprovals({
    approvals: core.approvals,
    executors: [
      ...createCoreAgentCommandExecutors({ tenancy: core.tenancy, access: core.access }),
      ...createModuleCommands({ firestore: firebase.firestore, access: core.access, audit: core.audit }),
    ],
    access: core.access,
    idempotency: core.pipeline.idempotency,
  });
  const files = createFirebaseFilesServices({
    firebase,
    env: { APP_ENV: env.APP_ENV, FILES_BUCKET: env.FILES_BUCKET, FIREBASE_STORAGE_EMULATOR_HOST: env.FIREBASE_STORAGE_EMULATOR_HOST },
    logger: processLogger,
  });
  // postgres.js connects lazily; the web login role may SET ROLE knowledge_runtime (migration 0005).
  const sql = createPostgresClient({ DATABASE_URL: env.DATABASE_URL });
  const knowledge = createKnowledgeServices({
    repository: createPostgresKnowledgeRepository(sql),
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
  const flagsDeps = {
    pipeline: core.pipeline,
    flags: createFirebaseFlagsServices({ firebase, appEnv: env.APP_ENV, audit: core.audit, clock: core.pipeline.clock, environmentDefaults: flagEnvironmentDefaults(env) }),
  };
  // SP5 console (decision 0040): the runtime's traces and experiments; the overview reads its eval status there.
  const runtimeConsole = createMastraConsoleGateway(gatewayOptions);
  const consoleDeps = { pipeline: core.pipeline, console: createFirebaseConsoleServices({ firebase, sql, audit: core.audit, clock: core.pipeline.clock, evals: runtimeConsole }) };
  const observabilityDeps = {
    pipeline: core.pipeline,
    observability: createObservabilityServices({
      console: runtimeConsole,
      getAgentSettings: consoleDeps.console.getAgentSettings,
      getConversation: createFirestoreConversationsServices({ firestore: firebase.firestore, clock: core.pipeline.clock }).getConversation,
      feedback: createFirestoreMessageFeedbackStore({ firestore: firebase.firestore }),
      clock: core.pipeline.clock,
      logger: processLogger,
      // The cost of a trace is what the usage ledger recorded for it (decision 0044).
      costs: createPostgresTraceCosts(sql),
    }),
  };
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
    // SP5 tenant settings (Task 14): the runtime's agent and workflow catalogs, and the usage summary of the ledger.
    ...buildTenantCatalogRoutes(workflowDeps),
    ...buildUsageRoutes({ pipeline: core.pipeline, getUsageSummary: createUsageServices({ repository: createPostgresUsageRepository(sql), clock: core.pipeline.clock }).getUsageSummary }),
    // SP4 chat (decisions 0031-0033): conversation metadata in Firestore, the stream from Mastra.
    ...buildChatRoutes(chatDeps),
    ...buildConversationsRoutes(chatDeps),
    // SP4 voice (decision 0034): Mastra gates the feature, the budget, the ledger and the audit.
    ...buildVoiceRoutes({ pipeline: core.pipeline, voice: createMastraVoiceGateway(gatewayOptions), resolveAccessContext: core.resolveAccessContext }),
    // SP5 feature flags (decision 0039): tenant overrides and the staff console.
    ...buildFlagsRoutes(flagsDeps),
    ...buildAdminFlagsRoutes(flagsDeps),
    // SP5 staff console and agent settings (decisions 0039, 0041): budgets materialize into usage.tenant_budgets.
    ...buildAdminPlatformRoutes(consoleDeps),
    ...buildAgentSettingsRoutes(consoleDeps),
    // SP5 prompt store (decision 0038): append-only versions, eval-gated activation through the Mastra eval route.
    ...buildPromptRoutes({ pipeline: core.pipeline, prompts: createPostgresPromptServices({ sql, audit: core.audit, mastraUrl: env.MASTRA_URL, serverlessToken }) }),
    // SP5 traces, evals and feedback (decision 0040): the runtime's console routes, tenant-filtered there.
    ...buildObservabilityRoutes(observabilityDeps),
    ...buildFeedbackRoutes(observabilityDeps),
    // SP5 staff operations (decision 0043): runs and schedules through the runtime console routes,
    // connectors from Firestore, and the local log ring of this process.
    ...buildAdminOperationsRoutes({
      pipeline: core.pipeline,
      operations: createMastraOperationsGateway(gatewayOptions),
      listConnectors: createFirestoreConnectorRepository({ firestore: firebase.firestore }).list,
    }),
    ...buildAdminLogsRoutes({ pipeline: core.pipeline, appEnv: env.APP_ENV, readLogs: readProcessLogBuffer }),
    // SP5 admin gaps (decision 0044): staff user search and the batched name lookup over `users/{uid}`.
    // SP5 admin gaps (decision 0044): every staff member's impersonation sessions, and ending any of them.
    ...buildAdminImpersonationRoutes({ pipeline: core.pipeline, platform: core.platform }),
    ...buildAdminUsersRoutes({ pipeline: core.pipeline, users: createFirestoreAdminUserDirectory({ firestore: firebase.firestore }) }),
  };
};
