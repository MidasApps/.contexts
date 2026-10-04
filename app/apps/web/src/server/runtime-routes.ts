import "server-only";
import {
  buildAdminFlagsRoutes,
  buildAdminImpersonationRoutes,
  buildAdminLogsRoutes,
  buildAdminOperationsRoutes,
  buildAdminPlatformRoutes,
  buildAdminUsersRoutes,
  buildAgentSettingsRoutes,
  buildChatRoutes,
  buildConnectorsRoutes,
  buildConversationsRoutes,
  buildCustomAgentsRoutes,
  buildCustomSkillsRoutes,
  buildFeedbackRoutes,
  buildFilesRoutes,
  buildFlagsRoutes,
  buildKnowledgeDocumentsRoutes,
  buildKnowledgeSourcesRoutes,
  buildMcpRoutes,
  buildObservabilityRoutes,
  buildPromptRoutes,
  buildSchedulesRoutes,
  buildTenantCatalogRoutes,
  buildUsageRoutes,
  buildVoiceRoutes,
  buildWorkflowRunStreamRoutes,
  buildWorkflowRunsRoutes,
  createCoreAgentCommandExecutors,
  createFirebaseAdmin,
  createFirebaseConnectorsServices,
  createFirebaseConsoleServices,
  createFirebaseCustomAgentsServices,
  createFirebaseFilesServices,
  createFirebaseFlagsServices,
  createFirestoreAdminUserDirectory,
  createFirestoreConnectorRepository,
  createFirestoreConversationsServices,
  createFirestoreMessageFeedbackStore,
  createKnowledgeServices,
  createMastraChatGateway,
  createMastraConsoleGateway,
  createMastraGateway,
  createMastraOperationsGateway,
  createMastraVoiceGateway,
  createMastraWorkflowApprovalSettler,
  createMastraWorkflowGateway,
  createObservabilityServices,
  createPostgresClient,
  createPostgresKnowledgeRepository,
  createPostgresPromptServices,
  createPostgresTraceCosts,
  createPostgresUsageRepository,
  createServerlessIdTokenSource,
  createUsageServices,
  type FilesServices,
  type FirebaseAdmin,
  flagEnvironmentDefaults,
  processLogger,
  readProcessLogBuffer,
  registerAgentCommandApprovals,
  registerWorkflowApprovals,
} from "@core/services";
import type { CoreRoutes, CoreServer } from "@core/services/composition";
import type { WebEnv } from "@/web-env.schema";
import { createModuleCommands, createModuleRoutes } from "./modules";

// The model id only matters for search, which runs in Mastra; the web routes list, read and delete.
const UNUSED_SEARCH_MODEL = "web/no-search";

/** What every route slice below shares: the core server, the env, the Admin SDK, Postgres and the gateways' target. */
type RuntimeRouteContext = {
  readonly core: CoreServer;
  readonly env: WebEnv;
  readonly firebase: FirebaseAdmin;
  readonly sql: ReturnType<typeof createPostgresClient>;
  readonly gatewayOptions: {
    readonly baseUrl: string;
    readonly serverlessToken: ReturnType<typeof createServerlessIdTokenSource> | null;
  };
  readonly files: FilesServices;
  readonly customAgents: ReturnType<typeof createFirebaseCustomAgentsServices>;
};

/** Connectors, files, the knowledge base and `POST /v1/mcp` (SP3 Tasks 13, 14, 21 and 24). */
const buildContentRoutes = (ctx: RuntimeRouteContext): CoreRoutes => {
  const { core, env, files } = ctx;
  const knowledge = createKnowledgeServices({
    repository: createPostgresKnowledgeRepository(ctx.sql),
    embeddingModel: UNUSED_SEARCH_MODEL,
  });
  const gateway = createMastraGateway(ctx.gatewayOptions);
  const connectors = createFirebaseConnectorsServices({
    firebase: ctx.firebase,
    env: { APP_ENV: env.APP_ENV, FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID },
    audit: core.audit,
    clock: core.pipeline.clock,
  });
  return {
    ...buildConnectorsRoutes({ pipeline: core.pipeline, connectors }),
    ...buildFilesRoutes({ pipeline: core.pipeline, files }),
    ...buildKnowledgeDocumentsRoutes({ pipeline: core.pipeline, knowledge }),
    ...buildKnowledgeSourcesRoutes({
      pipeline: core.pipeline,
      gateway,
      getReadyFile: files.getReadyFile,
      resolveAccessContext: core.resolveAccessContext,
    }),
    ...buildMcpRoutes({ pipeline: core.pipeline, gateway, resolveAccessContext: core.resolveAccessContext }),
  };
};

/** SP5 workflow runs, schedules, the tenant catalogs, custom agents and skills, and the usage summary. */
const buildWorkflowRoutes = (ctx: RuntimeRouteContext): CoreRoutes => {
  const { core } = ctx;
  // SP5 workflow runs and tenant schedules (decisions 0037, 0040): custom Mastra routes with the caller's Bearer.
  const workflowDeps = {
    pipeline: core.pipeline,
    gateway: createMastraWorkflowGateway(ctx.gatewayOptions),
    resolveAccessContext: core.resolveAccessContext,
  };
  // Tenant-defined agents and skills (decision 0046): Firestore records, limits from the plan of the organization.
  const customAgentsDeps = { ...workflowDeps, customAgents: ctx.customAgents };
  return {
    ...buildWorkflowRunsRoutes(workflowDeps),
    ...buildWorkflowRunStreamRoutes(workflowDeps),
    ...buildSchedulesRoutes(workflowDeps),
    // SP5 tenant settings (Task 14): the runtime's agent and workflow catalogs, and the usage summary of the ledger.
    ...buildTenantCatalogRoutes(workflowDeps),
    ...buildCustomAgentsRoutes(customAgentsDeps),
    ...buildCustomSkillsRoutes(customAgentsDeps),
    ...buildUsageRoutes({
      pipeline: core.pipeline,
      getUsageSummary: createUsageServices({
        repository: createPostgresUsageRepository(ctx.sql),
        clock: core.pipeline.clock,
      }).getUsageSummary,
    }),
  };
};

/** SP4 chat, conversations and voice, and the SP5 feature flags that gate them. */
const buildChatAndFlagsRoutes = (ctx: RuntimeRouteContext): CoreRoutes => {
  const { core, env, files } = ctx;
  const flagsDeps = {
    pipeline: core.pipeline,
    flags: createFirebaseFlagsServices({
      firebase: ctx.firebase,
      appEnv: env.APP_ENV,
      audit: core.audit,
      clock: core.pipeline.clock,
      environmentDefaults: flagEnvironmentDefaults(env),
    }),
  };
  const chatDeps = {
    pipeline: core.pipeline,
    chat: createMastraChatGateway(ctx.gatewayOptions),
    conversations: createFirestoreConversationsServices({
      firestore: ctx.firebase.firestore,
      clock: core.pipeline.clock,
    }),
    resolveAccessContext: core.resolveAccessContext,
    files: { getReadyFile: files.getReadyFile, readFileBytes: files.readFileBytes },
    isChatAgentEnabled: ctx.customAgents.isChatAgentEnabled,
  };
  return {
    // SP4 chat (decisions 0031-0033): conversation metadata in Firestore, the stream from Mastra.
    ...buildChatRoutes(chatDeps),
    ...buildConversationsRoutes(chatDeps),
    // SP4 voice (decision 0034): Mastra gates the feature, the budget, the ledger and the audit.
    ...buildVoiceRoutes({
      pipeline: core.pipeline,
      voice: createMastraVoiceGateway(ctx.gatewayOptions),
      resolveAccessContext: core.resolveAccessContext,
      // The chat asks whether to show voice at all (`GET /v1/voice/availability`, decision 0034).
      readFlags: (tenantId) => flagsDeps.flags.getFlagValues({ tenantId }),
    }),
    // SP5 feature flags (decision 0039): tenant overrides and the staff console.
    ...buildFlagsRoutes(flagsDeps),
    ...buildAdminFlagsRoutes(flagsDeps),
  };
};

/** SP5 console: staff platform settings, agent settings, the prompt store, traces, evals and feedback. */
const buildConsoleRoutes = (ctx: RuntimeRouteContext): CoreRoutes => {
  const { core, env, sql } = ctx;
  const { firestore } = ctx.firebase;
  // SP5 console (decision 0040): the runtime's traces and experiments; the overview reads its eval status there.
  const runtimeConsole = createMastraConsoleGateway(ctx.gatewayOptions);
  const consoleDeps = {
    pipeline: core.pipeline,
    console: createFirebaseConsoleServices({
      firebase: ctx.firebase,
      sql,
      audit: core.audit,
      clock: core.pipeline.clock,
      evals: runtimeConsole,
    }),
  };
  const observabilityDeps = {
    pipeline: core.pipeline,
    observability: createObservabilityServices({
      console: runtimeConsole,
      getAgentSettings: consoleDeps.console.getAgentSettings,
      getConversation: createFirestoreConversationsServices({ firestore, clock: core.pipeline.clock }).getConversation,
      feedback: createFirestoreMessageFeedbackStore({ firestore }),
      clock: core.pipeline.clock,
      logger: processLogger,
      // The cost of a trace is what the usage ledger recorded for it (decision 0044).
      costs: createPostgresTraceCosts(sql),
    }),
  };
  const { serverlessToken } = ctx.gatewayOptions;
  return {
    // SP5 staff console and agent settings (decisions 0039, 0041): budgets materialize into usage.tenant_budgets.
    ...buildAdminPlatformRoutes(consoleDeps),
    ...buildAgentSettingsRoutes(consoleDeps),
    // SP5 prompt store (decision 0038): append-only versions, eval-gated activation through the Mastra eval route.
    ...buildPromptRoutes({
      pipeline: core.pipeline,
      prompts: createPostgresPromptServices({ sql, audit: core.audit, mastraUrl: env.MASTRA_URL, serverlessToken }),
    }),
    // SP5 traces, evals and feedback (decision 0040): the runtime's console routes, tenant-filtered there.
    ...buildObservabilityRoutes(observabilityDeps),
    ...buildFeedbackRoutes(observabilityDeps),
  };
};

/** SP5 staff operations, logs, impersonation sessions and the user directory (decisions 0043, 0044). */
const buildAdminOperationsSliceRoutes = (ctx: RuntimeRouteContext): CoreRoutes => {
  const { core } = ctx;
  const { firestore } = ctx.firebase;
  return {
    // SP5 staff operations (decision 0043): runs and schedules through the runtime console routes,
    // connectors from Firestore, and the local log ring of this process.
    ...buildAdminOperationsRoutes({
      pipeline: core.pipeline,
      operations: createMastraOperationsGateway(ctx.gatewayOptions),
      listConnectors: createFirestoreConnectorRepository({ firestore }).list,
    }),
    ...buildAdminLogsRoutes({ pipeline: core.pipeline, appEnv: ctx.env.APP_ENV, readLogs: readProcessLogBuffer }),
    // SP5 admin gaps (decision 0044): staff user search and the batched name lookup over `users/{uid}`.
    // SP5 admin gaps (decision 0044): every staff member's impersonation sessions, and ending any of them.
    ...buildAdminImpersonationRoutes({ pipeline: core.pipeline, platform: core.platform }),
    ...buildAdminUsersRoutes({ pipeline: core.pipeline, users: createFirestoreAdminUserDirectory({ firestore }) }),
  };
};

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
  const moduleDeps = { firestore: firebase.firestore, access: core.access, audit: core.audit };
  // The command registry: core commands plus the installed modules' (SP3 Task 19).
  registerAgentCommandApprovals({
    approvals: core.approvals,
    executors: [
      ...createCoreAgentCommandExecutors({ tenancy: core.tenancy, access: core.access }),
      ...createModuleCommands(moduleDeps),
    ],
    access: core.access,
    idempotency: core.pipeline.idempotency,
  });
  const files = createFirebaseFilesServices({
    firebase,
    env: {
      APP_ENV: env.APP_ENV,
      FILES_BUCKET: env.FILES_BUCKET,
      FIREBASE_STORAGE_EMULATOR_HOST: env.FIREBASE_STORAGE_EMULATOR_HOST,
    },
    logger: processLogger,
  });
  // postgres.js connects lazily; the web login role may SET ROLE knowledge_runtime (migration 0005).
  const sql = createPostgresClient({ DATABASE_URL: env.DATABASE_URL });
  const serverlessToken =
    env.APP_ENV === "local" || env.MASTRA_AUDIENCE === undefined
      ? null
      : createServerlessIdTokenSource({ audience: env.MASTRA_AUDIENCE });
  registerWorkflowApprovals({
    approvals: core.approvals,
    settler: createMastraWorkflowApprovalSettler({ baseUrl: env.MASTRA_URL, serverlessToken }),
  });
  const ctx: RuntimeRouteContext = {
    core,
    env,
    firebase,
    sql,
    gatewayOptions: { baseUrl: env.MASTRA_URL, serverlessToken },
    files,
    customAgents: createFirebaseCustomAgentsServices({ firebase, audit: core.audit, clock: core.pipeline.clock }),
  };
  return {
    // The installed modules' own `/v1` endpoints (follow-up #38, decision 0063).
    ...createModuleRoutes({ ...moduleDeps, pipeline: core.pipeline }),
    ...buildContentRoutes(ctx),
    ...buildWorkflowRoutes(ctx),
    ...buildChatAndFlagsRoutes(ctx),
    ...buildConsoleRoutes(ctx),
    ...buildAdminOperationsSliceRoutes(ctx),
  };
};
