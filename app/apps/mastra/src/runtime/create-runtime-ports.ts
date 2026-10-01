import { type AgentRuntimePorts, createWebContentPort, embeddingModelIdOf, type FilesPort } from "@core/agents";
import { TenantIdSchema } from "@core/contracts";
import {
  type AccessReaders,
  type AgentCommandExecutor,
  type ApiKeyAuthenticator,
  agentCommandExecutors,
  createCoreAgentCommandExecutors,
  createFirebaseConnectorsServices,
  createFirebaseFilesServices,
  createKnowledgeServices,
  createLogKnowledgeEventPublisher,
  createPostgresClient,
  createPostgresKnowledgeRepository,
  createPostgresSemanticRunner,
  createPostgresUsageRepository,
  createUsageServices,
  createSemanticViewRegistry,
  type FilesServices,
  type FirebaseAdmin,
  guardSemanticSql,
  type Logger,
  type ResolveAccessContext,
  makeRunSemanticQuery,
  registerAgentCommandApprovals,
  registerWorkflowApprovals,
  type ServicesEnv,
  systemClock,
} from "@core/services";
import { type CoreServerModule, createCoreServer } from "@core/services/composition";
import { bindAccessPort } from "./access-port-binding.ts";
import { bindApprovalsPort } from "./approvals-port-binding.ts";
import { bindAuditPort } from "./audit-port-binding.ts";
import { bindKnowledgePort } from "./knowledge-port-binding.ts";
import { bindProjectsPort } from "./projects-port-binding.ts";
import { bindUsagePort } from "./usage-port-binding.ts";
import { UNWIRED_PORTS } from "./unwired-ports.ts";
import { createLogNotificationPort } from "./notifications-port-binding.ts";
import { bindUsageReportPort, type UsageReportBindingEnv } from "./usage-report-port-binding.ts";
import { bindWorkflowApprovalsPort, bindWorkflowCommandsPort, RUNTIME_SIDE_SETTLER } from "./workflow-ports-binding.ts";

export type RuntimePortsEnv = Pick<ServicesEnv, "API_KEY_PREFIX" | "DATABASE_URL" | "APP_ENV" | "AI_MODE" | "FIREBASE_STORAGE_EMULATOR_HOST" | "FIREBASE_PROJECT_ID"> &
  Partial<Pick<UsageReportBindingEnv, "USAGE_SINK" | "BIGQUERY_DATASET_AI_OBSERVABILITY">> & {
  /** Model id of the stored vectors in real mode; search only compares vectors of this model (decision 0022). */
  readonly AI_MODEL_EMBEDDING: string;
  /** Bucket of uploads (files context). */
  readonly FILES_BUCKET: string;
  /** Platform Firecrawl key and self-hosted API URL (knowledge URL sources, decision 0027). */
  readonly FIRECRAWL_API_KEY?: string | undefined;
  readonly FIRECRAWL_API_URL?: string | undefined;
};

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
  /** Extra command executors (tests: a module command the workflow HITL applies). */
  readonly commandExecutors?: readonly AgentCommandExecutor[];
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
 * - projects: SP1 `createProject` (the action agent's core command, SP3 Task 20).
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
 * - settings: fail-closed until SP5.
 * @param args.modules installed modules (their permissions join SP1's registry).
 */
export const createRuntimePorts = (args: {
  env: RuntimePortsEnv;
  firebase: FirebaseAdmin;
  logger: Logger;
  modules?: readonly CoreServerModule[];
  adapters?: RuntimePortsAdapters;
}): AgentRuntimePorts => {
  const { adapters = {} } = args;
  const core = createCoreServer({
    env: { API_KEY_PREFIX: args.env.API_KEY_PREFIX },
    firebase: args.firebase,
    logger: args.logger,
    ...(args.modules === undefined ? {} : { modules: args.modules }),
    adapters: {
      ...(adapters.accessReaders === undefined ? {} : { accessReaders: adapters.accessReaders }),
      ...(adapters.apiKeyAuthenticator === undefined ? {} : { apiKeyAuthenticator: adapters.apiKeyAuthenticator }),
    },
  });
  // postgres.js connects lazily: no connection until the first query.
  const sql = createPostgresClient({ DATABASE_URL: args.env.DATABASE_URL });
  const runner = createPostgresSemanticRunner(sql);
  const knowledge = createKnowledgeServices({ repository: createPostgresKnowledgeRepository(sql), embeddingModel: embeddingModelIdOf(args.env) });
  const files = createFirebaseFilesServices({ firebase: args.firebase, env: args.env, logger: args.logger });
  const connectors = createFirebaseConnectorsServices({ firebase: args.firebase, env: args.env, audit: core.audit, clock: systemClock });
  const executors = [...createCoreAgentCommandExecutors({ tenancy: core.tenancy, access: core.access }), ...(adapters.commandExecutors ?? [])];
  const commands = registerAgentCommandApprovals({ approvals: core.approvals, executors, access: core.access, idempotency: core.pipeline.idempotency });
  // Decided in /v1; registered here so SP1 accepts requests of the kind (decision 0036).
  registerWorkflowApprovals({ approvals: core.approvals, settler: RUNTIME_SIDE_SETTLER });
  return {
    access: bindAccessPort({ verifyBearer: core.verifyBearer, access: core.access, resolveAccessContext: adapters.resolveAccessContext ?? core.resolveAccessContext }),
    audit: bindAuditPort(core.audit),
    catalog: { runSemanticQuery: makeRunSemanticQuery({ views: createSemanticViewRegistry([]), guard: guardSemanticSql, runner }) },
    ...UNWIRED_PORTS,
    approvals: bindApprovalsPort(core.approvals),
    commands,
    connectors: { listActive: ({ tenantId }) => connectors.listActiveConnectors({ tenantId: TenantIdSchema.parse(tenantId) }) },
    secrets: { get: (secretRef) => connectors.secrets.get(secretRef) },
    webContent: createWebContentPort({ env: args.env, secrets: { get: (secretRef) => connectors.secrets.get(secretRef) } }),
    knowledge: bindKnowledgePort(knowledge),
    files: bindFilesPort(files),
    knowledgeEvents: createLogKnowledgeEventPublisher(args.logger),
    usage: bindUsagePort(createUsageServices({ repository: createPostgresUsageRepository(sql), clock: systemClock })),
    projects: bindProjectsPort({ tenancy: core.tenancy, access: core.access }),
    workflowApprovals: bindWorkflowApprovalsPort(core.approvals),
    workflowCommands: bindWorkflowCommandsPort({ executors: agentCommandExecutors(executors), access: core.access, commands }),
    notifications: createLogNotificationPort(args.logger),
    usageReport: bindUsageReportPort({
      env: {
        USAGE_SINK: args.env.USAGE_SINK ?? "none",
        BIGQUERY_DATASET_AI_OBSERVABILITY: args.env.BIGQUERY_DATASET_AI_OBSERVABILITY ?? "ai_observability",
        FIREBASE_PROJECT_ID: args.env.FIREBASE_PROJECT_ID,
      },
      sql,
      firestore: args.firebase.firestore,
      audit: core.audit,
      logger: args.logger,
    }),
  };
};
