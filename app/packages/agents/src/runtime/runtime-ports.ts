import type {
  AgentApprovalRequest,
  AgentSettings,
  ApprovalStatus,
  Citation,
  Connector,
  ConnectorLoadErrorCode,
  CustomAgent,
  CustomSkill,
  EvalExperimentSummary,
  KnowledgeDocument,
  KnowledgeDocumentSource,
  LlmCall,
  StoredFile,
  WorkflowResumeActionInput,
} from "@core/contracts";
import type { ContractCommand, ModelSettingsRepository, RunSemanticQuery } from "@core/services";

/**
 * Ports through which `@core/agents` consumes SP1/SP3 services (decision 0019).
 * They mirror the SP1 spec (§3.1, §5.2, §6, §10) and are bound in
 * `apps/mastra/src/runtime/create-runtime-ports.ts`; a naming drift in SP1 is
 * fixed there, never here. SP1's access services were not committed when this
 * file was written (SP3 Task 6), so the shapes follow the spec text.
 */

/** SP1 `Principal` (spec §3.1). */
export type AccessPrincipal =
  | {
      readonly type: "user";
      readonly uid: string;
      readonly mfa: boolean;
      readonly impersonation?: { readonly sessionId: string; readonly staffUid: string };
    }
  | { readonly type: "device"; readonly deviceId: string; readonly tenantId: string }
  | { readonly type: "service"; readonly apiKeyId: string; readonly tenantId: string; readonly ownerUid: string };

/** SP1 `NodeRef` (spec §5.2). */
export type NodeRef =
  | { readonly level: "platform" }
  | { readonly level: "organization"; readonly tenantId: string }
  | { readonly level: "project"; readonly tenantId: string; readonly projectId: string }
  | { readonly level: "unit"; readonly tenantId: string; readonly projectId: string; readonly unitId: string };

/** SP1 `regional` block of `resolveAccessContext` (spec §4, §10). */
export type RegionalSettings = {
  readonly locale: string;
  readonly displayTimeZone: string;
  readonly nodeTimeZone: string;
  readonly currency: string;
};

/** SP1 `resolveAccessContext` result (spec §10). */
export type AccessContext = {
  readonly tenantId: string;
  readonly projectId?: string;
  readonly unitId?: string;
  readonly principal: AccessPrincipal;
  readonly permissions: readonly string[];
  readonly regional: RegionalSettings;
};

/** SP1 `AuthorizeDecision` (spec §5.2); `reason` is one of SP1's `DenyReason`s. */
export type AuthorizeDecision =
  | { readonly allowed: true; readonly requiresApproval: boolean }
  | { readonly allowed: false; readonly reason: string };

export type AuthorizeRequest = {
  readonly principal: AccessPrincipal;
  readonly permission: string;
  readonly node: NodeRef;
  /** Agent permission ceiling: effective = principal ∩ ceiling. */
  readonly ceiling?: ReadonlySet<string>;
};

export type AccessPort = {
  /**
   * Verifies a Bearer credential (Firebase ID token or prefixed API key).
   * @returns `null` for a missing, invalid, expired or revoked credential (401).
   */
  readonly verifyBearer: (input: { token: string; checkRevoked: boolean }) => Promise<AccessPrincipal | null>;
  /** @returns `null` when the principal has no membership on the node (fail-closed: no permissions). */
  readonly resolveAccessContext: (input: {
    principal: AccessPrincipal;
    node: NodeRef;
  }) => Promise<AccessContext | null>;
  /** Fail-closed decision; rejects only on infrastructure errors (never resolves to allowed on error). */
  readonly authorize: (request: AuthorizeRequest) => Promise<AuthorizeDecision>;
  readonly getEffectivePermissions: (input: {
    principal: AccessPrincipal;
    node: NodeRef;
    ceiling?: ReadonlySet<string>;
  }) => Promise<ReadonlySet<string>>;
};

/** SP1 `AuditWriter.record` entry (spec §6.7); actions are SCREAMING_SNAKE past tense. */
export type AuditEntry = {
  readonly action: string;
  readonly tenantId: string;
  readonly actor: AccessPrincipal;
  readonly target?: { readonly type: string; readonly id: string };
  /** Never raw user input: hashes, ids and outcomes only. */
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
  readonly requestId?: string;
};

export type AuditPort = { readonly record: (entry: AuditEntry) => Promise<void> };

/**
 * Creates an SP1 approval request whose action is the SP3 `agent-command` handler.
 * Rejects when SP1 refuses or fails; the tool pipeline answers `APPROVAL_UNAVAILABLE`.
 */
export type ApprovalPort = {
  readonly requestApproval: (input: {
    readonly principal: AccessPrincipal;
    readonly node: NodeRef;
    readonly permission: string;
    readonly action: AgentApprovalRequest;
    /** Correlation of the agent run (the `APPROVAL_REQUESTED` audit entry carries it). */
    readonly requestId: string;
  }) => Promise<{ readonly approvalId: string }>;
};

/**
 * At-most-once command execution keyed by `runId:toolCallId` (decision 0025, follow-up #26),
 * shared with the SP1 `agent-command` approval handler. Rejects with a `code` of
 * `IDEMPOTENCY_KEY_REUSED` or `COMMAND_IN_PROGRESS`, or with whatever `run` threw.
 */
export type CommandIdempotencyPort = {
  readonly runOnce: (command: {
    readonly tenantId: string;
    readonly commandId: string;
    readonly idempotencyKey: string;
    readonly input: unknown;
    readonly run: () => Promise<unknown>;
  }) => Promise<{ readonly output: unknown; readonly replayed: boolean }>;
};

export type BudgetCheck =
  | { readonly allowed: true; readonly alert: boolean }
  | { readonly allowed: false; readonly reason: "BUDGET_EXCEEDED" };

/**
 * One agent run for the usage ledger (`usage.agent_runs`, decision 0066); the `usage` context
 * validates it. `tripwireProcessorId` names the guardrail that stopped the run, null when none did.
 */
export type AgentRunRecord = {
  readonly id: string;
  readonly requestId: string | null;
  readonly traceId: string | null;
  readonly tenantId: string;
  readonly userId: string | null;
  readonly agentId: string;
  readonly tripwireProcessorId: string | null;
  readonly occurredAt: string;
};

export type UsagePort = {
  readonly recordLlmCalls: (calls: readonly LlmCall[]) => Promise<void>;
  readonly recordAgentRuns: (runs: readonly AgentRunRecord[]) => Promise<void>;
  readonly checkTenantBudget: (input: { tenantId: string }) => Promise<BudgetCheck>;
};

/** A document to register before its chunks are embedded (SP3 spec §11). */
export type KnowledgeDocumentInput = {
  readonly tenantId: string;
  readonly namespace: string;
  readonly source: KnowledgeDocumentSource;
  readonly sourceRef: string;
  readonly title: string | null;
  readonly sourceUrl: string | null;
  readonly mimeType: string | null;
  /** SHA-256 hex of the extracted text. */
  readonly contentHash: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
  readonly createdBy: string | null;
};

export type KnowledgeChunkInput = {
  readonly chunkIndex: number;
  readonly text: string;
  readonly tokenCount: number;
  readonly embedding: readonly number[];
};

/**
 * Knowledge base (bound to the `knowledge` use cases). Tenant and namespaces always
 * come from the server-side context; writes reject on a use-case rule violation.
 */
export type KnowledgePort = {
  readonly searchChunks: (input: {
    readonly tenantId: string;
    readonly namespaces: readonly string[];
    readonly embedding: readonly number[];
    readonly topK: number;
  }) => Promise<readonly Citation[]>;
  /** Upserts by `(tenant, source, sourceRef)`; `unchanged` = same content already indexed (skip embedding). */
  readonly registerDocument: (
    input: KnowledgeDocumentInput,
  ) => Promise<{ readonly document: KnowledgeDocument; readonly unchanged: boolean }>;
  /** Replaces every chunk of the document in one transaction and marks it `ready`. */
  readonly replaceChunks: (input: {
    readonly tenantId: string;
    readonly documentId: string;
    readonly embeddingModel: string;
    readonly embeddingVersion: string;
    readonly chunks: readonly KnowledgeChunkInput[];
  }) => Promise<{ readonly chunkCount: number }>;
};

/** Why a file cannot be read for ingestion; answers like the `files` context. */
export type FileReadError = "FILE_NOT_FOUND" | "FILE_NOT_READY" | "FILE_PURPOSE_MISMATCH";

/** Validated uploads (SP3 `files` context); only `ready` files of the context tenant are readable. */
export type FilesPort = {
  readonly getReadyFile: (input: {
    readonly tenantId: string;
    readonly fileId: string;
    readonly purpose: StoredFile["purpose"];
  }) => Promise<
    { readonly ok: true; readonly data: StoredFile } | { readonly ok: false; readonly error: FileReadError }
  >;
  readonly readFileBytes: (input: {
    readonly tenantId: string;
    readonly fileId: string;
    readonly purpose: StoredFile["purpose"];
  }) => Promise<
    | { readonly ok: true; readonly data: { readonly file: StoredFile; readonly bytes: Uint8Array } }
    | { readonly ok: false; readonly error: FileReadError }
  >;
};

/** A public web page as Markdown (Firecrawl scrape, SP3 Task 23; fixtures in fake mode). */
export type WebPage = { readonly url: string; readonly title: string | null; readonly markdown: string };

export type WebContentPort = {
  /** @throws when the page cannot be fetched; the SSRF guard lives in the adapter (Task 23). */
  readonly scrape: (input: {
    readonly url: string;
    readonly tenantId: string;
    readonly abortSignal?: AbortSignal;
  }) => Promise<WebPage>;
};

/** Domain events of the knowledge base; the binding assigns the ULID `eventId`. */
export type KnowledgeEventsPort = {
  readonly documentIndexed: (event: {
    readonly tenantId: string;
    readonly documentId: string;
    readonly source: KnowledgeDocumentSource;
    readonly chunkCount: number;
    readonly requestId: string | null;
  }) => Promise<void>;
};

export type ConnectorsPort = {
  readonly listActive: (input: { tenantId: string }) => Promise<readonly Connector[]>;
  /** Stores why a connector failed to load (`null` clears it) for the settings page; optional for hosts without one. */
  readonly recordLoad?: (input: {
    tenantId: string;
    connectorId: string;
    lastError: { code: ConnectorLoadErrorCode; at: string } | null;
  }) => Promise<void>;
};

/** Secret values by reference (Secret Manager outside local); never logged. */
export type SecretStore = {
  readonly get: (secretRef: string) => Promise<string | null>;
};

/** SP3 `catalog` context: read-only SQL over semantic views (bound to `makeRunSemanticQuery`). */
export type SemanticQueryPort = { readonly runSemanticQuery: RunSemanticQuery };

export type SettingsPort = { readonly getAgentSettings: (input: { tenantId: string }) => Promise<AgentSettings> };

/**
 * Feature flags (decision 0039): the effective value of every registry flag for an organization
 * (`tenantId: null` = the environment values). Rejects when the store fails; readers decide the
 * fail-safe (the kill-switch fails closed).
 */
/** A prompt body and the version it comes from. */
export type PromptBody = { readonly versionId: string; readonly body: string };

/** One stored prompt version, as the eval route reads it. */
export type PromptVersionRecord = PromptBody & {
  readonly agentId: string;
  readonly scope: "platform" | "tenant";
  readonly tenantId: string | null;
};

/**
 * Versioned prompts (decision 0038): the active platform instructions and the tenant's active
 * addendum of an agent, a version read and the eval verdict write of `run-prompt-eval`. Reads
 * reject on a store failure; the resolver then serves its cache or the code seed.
 */
export type PromptStorePort = {
  readonly getActive: (input: {
    readonly agentId: string;
    readonly tenantId: string | null;
  }) => Promise<{ readonly platform: PromptBody | null; readonly addendum: PromptBody | null }>;
  readonly getVersion: (input: {
    readonly versionId: string;
    readonly tenantId: string | null;
  }) => Promise<PromptVersionRecord | null>;
  readonly recordEval: (input: {
    readonly versionId: string;
    readonly tenantId: string | null;
    readonly experimentId: string;
    readonly verdict: "passed" | "failed";
  }) => Promise<void>;
};

export type FlagsPort = {
  readonly getValues: (input: { readonly tenantId: string | null }) => Promise<Readonly<Record<string, boolean>>>;
};

/** An SP1 approval request as workflows read it: effective status (a pending one past its expiry reads `expired`). */
export type WorkflowApprovalRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly status: ApprovalStatus;
  readonly kind: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly requestedBy: { readonly type: "user" | "device" | "service"; readonly id: string };
  readonly decidedBy: string | null;
  readonly reason: string | null;
};

/**
 * Workflow HITL on SP1 approval requests (decision 0036). `requestWorkflowApproval` creates a
 * request of kind `workflow-resume` as the run's principal (rejects when SP1 refuses);
 * `getApprovalRequest` is a system read used to verify every resume and by the settle route;
 * `cancelWorkflowApproval` cancels the pending request a cancelled run waited for (follow-up 82):
 * only a `workflow-resume` request that names `runId` (else `cancelled: false`); rejects on
 * infrastructure errors.
 */
export type WorkflowApprovalPort = {
  readonly requestWorkflowApproval: (input: {
    readonly principal: AccessPrincipal;
    readonly node: NodeRef;
    readonly permission: string;
    readonly action: WorkflowResumeActionInput;
    readonly summary: string;
    readonly requestId: string;
  }) => Promise<{ readonly approvalId: string }>;
  readonly getApprovalRequest: (input: {
    readonly approvalRequestId: string;
  }) => Promise<WorkflowApprovalRecord | null>;
  readonly cancelWorkflowApproval: (input: {
    readonly approvalRequestId: string;
    readonly runId: string;
    readonly requestId: string;
  }) => Promise<{ readonly cancelled: boolean }>;
};

/**
 * Runs a module command as a principal, at most once per idempotency key (SP3 executors and
 * idempotency records). Expected refusals answer a SCREAMING_SNAKE `code` (`UNKNOWN_COMMAND`,
 * `REQUESTER_FORBIDDEN`, `COMMAND_INPUT_INVALID`, ...); infrastructure errors reject.
 */
export type WorkflowCommandPort = {
  readonly run: (input: {
    readonly principal: AccessPrincipal;
    readonly tenantId: string;
    readonly node: NodeRef;
    readonly commandId: string;
    readonly input: unknown;
    readonly idempotencyKey: string;
    readonly requestId: string;
  }) => Promise<
    | { readonly ok: true; readonly output: unknown; readonly replayed: boolean }
    | { readonly ok: false; readonly code: string }
  >;
};

/** Kinds of the notices SP5 workflows send (decision 0037: paused schedule; decision 0039: budget alerts). */
export type WorkflowNotificationKind = "SCHEDULE_PAUSED" | "BUDGET_ALERT";

/**
 * A notice to the people of a tenant: the recipient (a uid, or `null` for the tenant's owners and
 * admins) and ids, numbers and codes only, never personal content. The delivery channel (e-mail,
 * in-app inbox) is the binding's concern.
 */
export type WorkflowNotification = {
  readonly tenantId: string;
  readonly recipientUid: string | null;
  readonly kind: WorkflowNotificationKind;
  readonly data: Readonly<Record<string, string | number | boolean | null>>;
};

export type NotificationPort = { readonly notify: (notification: WorkflowNotification) => Promise<void> };

/** One tenant's run of the `usage-report` workflow (SP5 Task 6, `makeReportTenantUsage`). */
export type TenantUsageReportResult = {
  readonly tenantId: string;
  readonly rollups: number;
  readonly exportedCalls: number;
  /** Budget thresholds reached for the first time this month (already stored and audited). */
  readonly newAlerts: readonly (80 | 100)[];
  readonly usedPercent: number;
};

/**
 * Usage reporting (decision 0039): live tenant ids for the platform run, and the per-tenant step
 * (rollups, warehouse export, budget thresholds). Both run as the platform, never as a caller.
 */
export type UsageReportPort = {
  readonly listTenantIds: () => Promise<readonly string[]>;
  readonly reportTenant: (input: {
    readonly tenantId: string;
    readonly requestId: string;
  }) => Promise<TenantUsageReportResult>;
};

/** SP1 approval sweeps (decision 0030 A3, SP5 spec §3.3): overdue pending → `expired`; stale `approved` → `failed`. */
export type ApprovalSweepPort = {
  readonly expire: (input: { readonly requestId: string }) => Promise<{ readonly expired: number }>;
  readonly failInterrupted: (input: { readonly requestId: string }) => Promise<{ readonly failed: number }>;
};

/** Conversations soft-deleted more than 30 days ago (SP4 metadata); the workflow deletes each Mastra thread. */
export type ConversationPurgePort = {
  readonly purgeDeleted: (input: {
    readonly deleteThread: (threadId: string) => Promise<boolean>;
  }) => Promise<{ readonly purged: number; readonly failed: number }>;
};

/** Eval experiment summaries finished since a time, and their warehouse export (decision 0040). */
export type EvalExportPort = {
  readonly listFinishedSince: (input: { readonly since: string }) => Promise<readonly EvalExperimentSummary[]>;
  /** @returns the rows sent (one per experiment and scorer; 0 in local). */
  readonly exportSummaries: (summaries: readonly EvalExperimentSummary[]) => Promise<number>;
};

/**
 * Tenant-defined agents and skills (decision 0046), read server side: the tenant always comes
 * from the verified context. A record of another tenant reads as missing. Reads reject on a store
 * failure (the runtime then fails the run closed).
 */
export type CustomAgentsPort = {
  /** The tenant's agent, enabled or not; `null` when it does not exist there. */
  readonly getAgent: (input: { readonly tenantId: string; readonly agentId: string }) => Promise<CustomAgent | null>;
  readonly listAgents: (input: { readonly tenantId: string }) => Promise<readonly CustomAgent[]>;
  readonly listSkills: (input: { readonly tenantId: string }) => Promise<readonly CustomSkill[]>;
};

export type AgentRuntimePorts = {
  readonly access: AccessPort;
  readonly audit: AuditPort;
  readonly approvals: ApprovalPort;
  readonly commands: CommandIdempotencyPort;
  readonly usage: UsagePort;
  readonly knowledge: KnowledgePort;
  readonly files: FilesPort;
  readonly webContent: WebContentPort;
  readonly knowledgeEvents: KnowledgeEventsPort;
  readonly connectors: ConnectorsPort;
  readonly secrets: SecretStore;
  readonly settings: SettingsPort;
  readonly catalog: SemanticQueryPort;
  /**
   * The one command registry (decision 0025): core commands and the installed modules'. The
   * action agent's tools are derived from it (`command-tools.ts`); the SP1 approval handler and
   * the workflow command port run the same entries.
   */
  readonly commandRegistry: readonly ContractCommand[];
  /** SP5 workflow HITL (decision 0036). */
  readonly workflowApprovals: WorkflowApprovalPort;
  readonly workflowCommands: WorkflowCommandPort;
  /** SP5 notices of scheduled and platform workflows (decisions 0037, 0039). */
  readonly notifications: NotificationPort;
  readonly usageReport: UsageReportPort;
  /** SP5 maintenance workflows (Task 7). */
  readonly approvalSweeps: ApprovalSweepPort;
  readonly conversationPurge: ConversationPurgePort;
  readonly evalExport: EvalExportPort;
  /** SP5 feature flags (Task 8, decision 0039); read through `createFlagReader` (30 s cache). */
  readonly flags: FlagsPort;
  /** SP5 prompt store (Task 9, decision 0038); read through `createInstructionsResolver` (60 s cache). */
  readonly prompts: PromptStorePort;
  /** Tenant-defined agents and skills (decision 0046); read through `createCustomAgentLoader` (60 s cache). */
  readonly customAgents: CustomAgentsPort;
  /**
   * Staff model settings (decision 0072); read through `createModelSettingsService` (60 s copy).
   * Absent (tests): the roles follow the environment and nothing is kept.
   */
  readonly modelSettings?: ModelSettingsRepository;
};
