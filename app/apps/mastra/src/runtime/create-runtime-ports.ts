import {
  type AgentRuntimePorts,
  createWebContentPort,
  embeddingModelIdOf,
  type FilesPort,
  type PromptStorePort,
} from "@core/agents";
import { ConnectorIdSchema, TenantIdSchema } from "@core/contracts";
import {
  type AccessReaders,
  type AgentCommandExecutor,
  type ApiKeyAuthenticator,
  agentCommandExecutors,
  createCoreAgentCommandExecutors,
  createFirebaseConnectorsServices,
  createFirebaseConsoleServices,
  createFirebaseCustomAgentsServices,
  createFirebaseFilesServices,
  createFirebaseFlagsServices,
  createKnowledgeServices,
  createLogKnowledgeEventPublisher,
  createPostgresClient,
  createPostgresKnowledgeRepository,
  createPostgresPromptRepository,
  createPostgresSemanticRunner,
  createPostgresUsageRepository,
  createSemanticViewRegistry,
  createUsageServices,
  type FilesServices,
  type FirebaseAdmin,
  flagEnvironmentDefaults,
  guardSemanticSql,
  type Logger,
  makeRunSemanticQuery,
  type PromptRepository,
  type ResolveAccessContext,
  registerAgentCommandApprovals,
  registerWorkflowApprovals,
  type ServicesEnv,
  systemClock,
} from "@core/services";
import { type CoreServer, createCoreServer } from "@core/services/composition";
import type { AppModule } from "../modules.ts";
import { bindAccessPort } from "./access-port-binding.ts";
import { bindApprovalsPort } from "./approvals-port-binding.ts";
import { bindAuditPort } from "./audit-port-binding.ts";
import { bindCustomAgentsPort } from "./custom-agents-port-binding.ts";
import { bindKnowledgePort } from "./knowledge-port-binding.ts";
import { bindApprovalSweepPort, bindConversationPurgePort, bindEvalExportPort } from "./maintenance-ports-binding.ts";
import { createLogNotificationPort } from "./notifications-port-binding.ts";
import { bindUsagePort } from "./usage-port-binding.ts";
import { bindUsageReportPort, type UsageReportBindingEnv } from "./usage-report-port-binding.ts";
import { bindWorkflowApprovalsPort, bindWorkflowCommandsPort, RUNTIME_SIDE_SETTLER } from "./workflow-ports-binding.ts";

export type RuntimePortsEnv = Pick<
  ServicesEnv,
  "API_KEY_PREFIX" | "DATABASE_URL" | "APP_ENV" | "AI_MODE" | "FIREBASE_STORAGE_EMULATOR_HOST" | "FIREBASE_PROJECT_ID"
> &
  Partial<Pick<UsageReportBindingEnv, "USAGE_SINK" | "BIGQUERY_DATASET_AI_OBSERVABILITY">> & {
    /** Model id of the stored vectors in real mode; search only compares vectors of this model (decision 0022). */
    readonly AI_MODEL_EMBEDDING: string;
    /** Bucket of uploads (files context). */
    readonly FILES_BUCKET: string;
    /** Boot defaults of the voice and memory flags (decision 0034 amendment, `flagEnvironmentDefaults`). */
    readonly AI_VOICE_ENABLED?: boolean | undefined;
    readonly AI_VOICE_REALTIME_ENABLED?: boolean | undefined;
    readonly AI_MEMORY_OBSERVATIONAL?: boolean | undefined;
    /** Platform Firecrawl key and self-hosted API URL (knowledge URL sources, decision 0027). */
    readonly FIRECRAWL_API_KEY?: string | undefined;
    readonly FIRECRAWL_API_URL?: string | undefined;
  };

// SP5 prompt store (decision 0038): the agents read bodies; the eval route reads a version and records its verdict.
const bindPromptStorePort = (repository: PromptRepository): PromptStorePort => ({
  getActive: (input) => repository.getActive(input),
  getVersion: async (input) => {
    const version = await repository.getVersion(input);
    return version === null
      ? null
      : {
          versionId: version.id,
          agentId: version.agentId,
          scope: version.scope,
          tenantId: version.tenantId,
          body: version.body,
        };
  },
  recordEval: (input) => repository.recordEval(input),
});

// The files use cases answer `{ code }` errors; the agents port carries the bare code.
const bindFilesPort = (files: Pick<FilesServices, "getReadyFile" | "readFileBytes">): FilesPort => ({
  getReadyFile: async (input) => {
    const result = await files.getReadyFile(input);
    return result.ok ? result : { ok: false, error: result.error.code };
  },
  readFileBytes: async (input) => {
    const result = await files.readFileBytes(input);
    return result.ok ? result : { ok: false, error: result.error.code };
  },
});

/** Adapter overrides for tests (in-memory SP1 readers, a resolver without Firestore). */
export type RuntimePortsAdapters = {
  readonly accessReaders?: AccessReaders;
  readonly apiKeyAuthenticator?: ApiKeyAuthenticator;
  readonly resolveAccessContext?: ResolveAccessContext;
  /** Extra executors outside the registry (tests: a command the approval handler and workflows run, without an agent tool). */
  readonly commandExecutors?: readonly AgentCommandExecutor[];
};

type RuntimeSql = ReturnType<typeof createPostgresClient>;
type RuntimeModules = readonly Pick<AppModule, "manifest" | "createCommands">[];

const createRuntimeCore = (args: {
  env: RuntimePortsEnv;
  firebase: FirebaseAdmin;
  logger: Logger;
  modules?: RuntimeModules | undefined;
  adapters: RuntimePortsAdapters;
}): CoreServer =>
  createCoreServer({
    env: { API_KEY_PREFIX: args.env.API_KEY_PREFIX },
    firebase: args.firebase,
    logger: args.logger,
    ...(args.modules === undefined ? {} : { modules: args.modules.map((module) => module.manifest) }),
    adapters: {
      ...(args.adapters.accessReaders === undefined ? {} : { accessReaders: args.adapters.accessReaders }),
      ...(args.adapters.apiKeyAuthenticator === undefined
        ? {}
        : { apiKeyAuthenticator: args.adapters.apiKeyAuthenticator }),
    },
  });

/** Knowledge search and chunks, ready uploads and the knowledge event log. */
const createKnowledgePorts = (args: {
  env: RuntimePortsEnv;
  firebase: FirebaseAdmin;
  logger: Logger;
  sql: RuntimeSql;
}): Pick<AgentRuntimePorts, "knowledge" | "files" | "knowledgeEvents"> => {
  const knowledge = createKnowledgeServices({
    repository: createPostgresKnowledgeRepository(args.sql),
    embeddingModel: embeddingModelIdOf(args.env),
  });
  const files = createFirebaseFilesServices({ firebase: args.firebase, env: args.env, logger: args.logger });
  return {
    knowledge: bindKnowledgePort(knowledge),
    files: bindFilesPort(files),
    knowledgeEvents: createLogKnowledgeEventPublisher(args.logger),
  };
};

/** Active tenant connectors, the secret store and the Firecrawl web content behind it. */
const createConnectorPorts = (args: {
  env: RuntimePortsEnv;
  firebase: FirebaseAdmin;
  core: CoreServer;
}): Pick<AgentRuntimePorts, "connectors" | "secrets" | "webContent"> => {
  const connectors = createFirebaseConnectorsServices({
    firebase: args.firebase,
    env: args.env,
    audit: args.core.audit,
    clock: systemClock,
  });
  return {
    connectors: {
      listActive: ({ tenantId }) => connectors.listActiveConnectors({ tenantId: TenantIdSchema.parse(tenantId) }),
      recordLoad: ({ tenantId, connectorId, lastError }) =>
        connectors.recordConnectorLoad({
          tenantId: TenantIdSchema.parse(tenantId),
          connectorId: ConnectorIdSchema.parse(connectorId),
          lastError,
        }),
    },
    secrets: { get: (secretRef) => connectors.secrets.get(secretRef) },
    webContent: createWebContentPort({
      env: args.env,
      secrets: { get: (secretRef) => connectors.secrets.get(secretRef) },
    }),
  };
};

/** The command registry, the agent and workflow command ports and their approval kinds. */
const createCommandPorts = (args: {
  firebase: FirebaseAdmin;
  core: CoreServer;
  modules?: RuntimeModules | undefined;
  extraExecutors?: readonly AgentCommandExecutor[] | undefined;
}): Pick<AgentRuntimePorts, "commands" | "commandRegistry" | "workflowApprovals" | "workflowCommands"> => {
  const { core } = args;
  const moduleDeps = { firestore: args.firebase.firestore, access: core.access, audit: core.audit };
  const commandRegistry = [
    ...createCoreAgentCommandExecutors({ tenancy: core.tenancy, access: core.access }),
    ...(args.modules ?? []).flatMap((module) => module.createCommands(moduleDeps)),
  ];
  const executors = [...commandRegistry, ...(args.extraExecutors ?? [])];
  const commands = registerAgentCommandApprovals({
    approvals: core.approvals,
    executors,
    access: core.access,
    idempotency: core.pipeline.idempotency,
  });
  // Decided in /v1; registered here so SP1 accepts requests of the kind (decision 0036).
  registerWorkflowApprovals({ approvals: core.approvals, settler: RUNTIME_SIDE_SETTLER });
  return {
    commands,
    commandRegistry,
    workflowApprovals: bindWorkflowApprovalsPort(core.approvals),
    workflowCommands: bindWorkflowCommandsPort({
      executors: agentCommandExecutors(executors),
      access: core.access,
      commands,
    }),
  };
};

/** Tenant console state the agents read: agent settings, flags and custom agents. */
const createConsolePorts = (args: {
  env: RuntimePortsEnv;
  firebase: FirebaseAdmin;
  core: CoreServer;
  sql: RuntimeSql;
}): Pick<AgentRuntimePorts, "settings" | "flags" | "customAgents"> => {
  const customAgents = createFirebaseCustomAgentsServices({
    firebase: args.firebase,
    audit: args.core.audit,
    clock: systemClock,
  });
  const settings = createFirebaseConsoleServices({
    firebase: args.firebase,
    sql: args.sql,
    audit: args.core.audit,
    clock: systemClock,
  });
  // Remote Config outside local, Firestore in local; the agents cache the values 30 s (decision 0039).
  const flags = createFirebaseFlagsServices({
    firebase: args.firebase,
    appEnv: args.env.APP_ENV,
    audit: args.core.audit,
    clock: systemClock,
    environmentDefaults: flagEnvironmentDefaults(args.env),
  });
  return {
    // SP5 Task 10: `agent-settings/{tenantId}` (defaults when missing), so the PII mode and enabled agents are the tenant's.
    settings: { getAgentSettings: ({ tenantId }) => settings.getAgentSettings({ tenantId }) },
    flags: { getValues: ({ tenantId }) => flags.getFlagValues({ tenantId }) },
    // Decision 0046: tenant-defined agents and skills (Firestore), read server side per run.
    customAgents: bindCustomAgentsPort(customAgents.runtime),
  };
};

/** Scheduled maintenance: usage reports, approval sweeps, conversation purge and eval export. */
const createMaintenancePorts = (args: {
  env: RuntimePortsEnv;
  firebase: FirebaseAdmin;
  logger: Logger;
  core: CoreServer;
  sql: RuntimeSql;
}): Pick<AgentRuntimePorts, "usageReport" | "approvalSweeps" | "conversationPurge" | "evalExport"> => {
  const sinkEnv = {
    USAGE_SINK: args.env.USAGE_SINK ?? "none",
    BIGQUERY_DATASET_AI_OBSERVABILITY: args.env.BIGQUERY_DATASET_AI_OBSERVABILITY ?? "ai_observability",
    FIREBASE_PROJECT_ID: args.env.FIREBASE_PROJECT_ID,
  } as const;
  return {
    usageReport: bindUsageReportPort({
      env: sinkEnv,
      sql: args.sql,
      firestore: args.firebase.firestore,
      audit: args.core.audit,
      logger: args.logger,
    }),
    approvalSweeps: bindApprovalSweepPort(args.core.approvals),
    conversationPurge: bindConversationPurgePort(args.firebase.firestore),
    evalExport: bindEvalExportPort({ env: sinkEnv, logger: args.logger }),
  };
};

/**
 * Binds `AgentRuntimePorts` to SP1/SP3 services (spec §3.3, decision 0019).
 * - access: `createCoreServer().verifyBearer` + access core (Firestore readers,
 *   SP1 Task 9) and SP1's `resolveAccessContext` (`CoreServer.resolveAccessContext`,
 *   SP1 Task 12): permissions and regional settings at the node, `null` fails closed.
 * - audit: SP1 `AuditWriter` (Firestore `audit-logs`), mapped in `bindAuditPort`.
 * - catalog: `makeRunSemanticQuery` over Postgres (no semantic view is registered yet).
 * - knowledge: search, register and replace chunks over `ai.documents` / `ai.chunks_v1`
 *   (row level security, role `knowledge_runtime`), vectors of `embeddingModelIdOf(env)` only.
 * - files: ready uploads of the `files` context (Firestore + `FILES_BUCKET`); knowledge events
 *   are structured log lines until the event bus exists.
 * - usage: ledger writes and tenant budget checks over `usage.llm_calls` / `usage.tenant_budgets`
 *   (row level security, role `usage_runtime`).
 * - command registry: the core commands (`tenancy.CreateProjectInput` → SP1 `createProject`) and
 *   the installed modules' (`AppModule.createCommands`); one definition per command for the agent
 *   tool, the approval handler and the workflow command port (decision 0025, SP3 Task 19).
 * - connectors and secrets: active tenant connectors (Firestore) and the secret store (Secret
 *   Manager outside local, the emulator collection in local), read server-side only.
 * - approvals: SP1 `requestApproval` (kind `agent-command`, whose handler this runtime also
 *   registers so SP1 accepts the kind); commands: at-most-once execution per
 *   `runId:toolCallId` over SP1's idempotency store, shared with that handler (follow-up #26).
 * - web content: Firecrawl scrape for knowledge URL sources, behind the SSRF guard (fixture
 *   pages in `AI_MODE=fake`; the tenant key `firecrawl-<tenantId>`, else the platform key).
 * - workflow approvals and commands: SP1 approval requests of kind `workflow-resume` (whose
 *   handler this runtime registers so SP1 accepts the kind; approvals execute in `/v1`) and the
 *   SP3 executors run once per workflow run (decision 0036).
 * - flags: the SP5 flags services (Remote Config outside local, Firestore `feature-flags` in local,
 *   tenant overrides in Firestore; the env voice/memory switches only seed defaults, decision 0039).
 * - settings: SP5 agent settings (Firestore `agent-settings`, defaults when none are stored).
 * - custom agents: tenant-defined agents and skills (Firestore `custom-agents`, `custom-skills`;
 *   decision 0046), read server side for the run's tenant only.
 * @param args.modules installed modules: their manifests join SP1's registries (permissions, unit
 *   types, settings) and their commands join the command registry.
 */
export const createRuntimePorts = (args: {
  env: RuntimePortsEnv;
  firebase: FirebaseAdmin;
  logger: Logger;
  modules?: RuntimeModules;
  adapters?: RuntimePortsAdapters;
}): AgentRuntimePorts => {
  const { adapters = {} } = args;
  const core = createRuntimeCore({ ...args, adapters });
  // postgres.js connects lazily: no connection until the first query.
  const sql = createPostgresClient({ DATABASE_URL: args.env.DATABASE_URL });
  const shared = { env: args.env, firebase: args.firebase, logger: args.logger, core, sql };
  return {
    access: bindAccessPort({
      verifyBearer: core.verifyBearer,
      access: core.access,
      resolveAccessContext: adapters.resolveAccessContext ?? core.resolveAccessContext,
    }),
    audit: bindAuditPort(core.audit),
    catalog: {
      runSemanticQuery: makeRunSemanticQuery({
        views: createSemanticViewRegistry([]),
        guard: guardSemanticSql,
        runner: createPostgresSemanticRunner(sql),
      }),
    },
    approvals: bindApprovalsPort(core.approvals),
    ...createKnowledgePorts(shared),
    ...createConnectorPorts(shared),
    ...createCommandPorts({ ...shared, modules: args.modules, extraExecutors: adapters.commandExecutors }),
    ...createConsolePorts(shared),
    usage: bindUsagePort(createUsageServices({ repository: createPostgresUsageRepository(sql), clock: systemClock })),
    notifications: createLogNotificationPort(args.logger),
    prompts: bindPromptStorePort(createPostgresPromptRepository(sql)),
    ...createMaintenancePorts(shared),
  };
};
