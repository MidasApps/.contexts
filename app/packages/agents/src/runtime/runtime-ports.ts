import type {
  AgentApprovalRequest,
  AgentSettings,
  Citation,
  CreateProjectInput,
  Connector,
  KnowledgeDocument,
  KnowledgeDocumentSource,
  LlmCall,
  StoredFile,
} from "@core/contracts";
import type { RunSemanticQuery } from "@core/services";

/**
 * Ports through which `@core/agents` consumes SP1/SP3 services (decision 0019).
 * They mirror the SP1 spec (§3.1, §5.2, §6, §10) and are bound in
 * `apps/mastra/src/runtime/create-runtime-ports.ts`; a naming drift in SP1 is
 * fixed there, never here. SP1's access services were not committed when this
 * file was written (SP3 Task 6), so the shapes follow the spec text.
 */

/** SP1 `Principal` (spec §3.1). */
export type AccessPrincipal =
  | { readonly type: "user"; readonly uid: string; readonly mfa: boolean; readonly impersonation?: { readonly sessionId: string; readonly staffUid: string } }
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
  readonly resolveAccessContext: (input: { principal: AccessPrincipal; node: NodeRef }) => Promise<AccessContext | null>;
  /** Fail-closed decision; rejects only on infrastructure errors (never resolves to allowed on error). */
  readonly authorize: (request: AuthorizeRequest) => Promise<AuthorizeDecision>;
  readonly getEffectivePermissions: (input: { principal: AccessPrincipal; node: NodeRef; ceiling?: ReadonlySet<string> }) => Promise<ReadonlySet<string>>;
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

/** Creates an SP1 approval request whose action is the SP3 `agent-command` handler. */
export type ApprovalPort = {
  readonly requestApproval: (input: {
    readonly principal: AccessPrincipal;
    readonly node: NodeRef;
    readonly permission: string;
    readonly action: AgentApprovalRequest;
  }) => Promise<{ readonly approvalId: string }>;
};

export type BudgetCheck =
  | { readonly allowed: true; readonly alert: boolean }
  | { readonly allowed: false; readonly reason: "BUDGET_EXCEEDED" };

export type UsagePort = {
  readonly recordLlmCalls: (calls: readonly LlmCall[]) => Promise<void>;
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
  readonly registerDocument: (input: KnowledgeDocumentInput) => Promise<{ readonly document: KnowledgeDocument; readonly unchanged: boolean }>;
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
  }) => Promise<{ readonly ok: true; readonly data: StoredFile } | { readonly ok: false; readonly error: FileReadError }>;
  readonly readFileBytes: (input: {
    readonly tenantId: string;
    readonly fileId: string;
    readonly purpose: StoredFile["purpose"];
  }) => Promise<{ readonly ok: true; readonly data: { readonly file: StoredFile; readonly bytes: Uint8Array } } | { readonly ok: false; readonly error: FileReadError }>;
};

/** A public web page as Markdown (Firecrawl scrape, SP3 Task 23; fixtures in fake mode). */
export type WebPage = { readonly url: string; readonly title: string | null; readonly markdown: string };

export type WebContentPort = {
  /** @throws when the page cannot be fetched; the SSRF guard lives in the adapter (Task 23). */
  readonly scrape: (input: { readonly url: string; readonly tenantId: string; readonly abortSignal?: AbortSignal }) => Promise<WebPage>;
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

export type ConnectorsPort = { readonly listActive: (input: { tenantId: string }) => Promise<readonly Connector[]> };

/** Secret values by reference (Secret Manager outside local); never logged. */
export type SecretStore = {
  readonly get: (secretRef: string) => Promise<string | null>;
};

/** SP3 `catalog` context: read-only SQL over semantic views (bound to `makeRunSemanticQuery`). */
export type SemanticQueryPort = { readonly runSemanticQuery: RunSemanticQuery };

/**
 * SP1 tenancy commands the core action agent runs (SP3 Task 20; module commands arrive
 * with Task 19). The binding calls the same use case as `/v1`, which authorizes again.
 */
export type ProjectsPort = {
  readonly createProject: (input: {
    readonly principal: AccessPrincipal;
    readonly tenantId: string;
    readonly requestId: string;
    readonly input: CreateProjectInput;
  }) => Promise<{ readonly ok: true; readonly data: { readonly projectId: string; readonly name: string } } | { readonly ok: false; readonly error: "FORBIDDEN" }>;
};

export type SettingsPort = { readonly getAgentSettings: (input: { tenantId: string }) => Promise<AgentSettings> };

export type AgentRuntimePorts = {
  readonly access: AccessPort;
  readonly audit: AuditPort;
  readonly approvals: ApprovalPort;
  readonly usage: UsagePort;
  readonly knowledge: KnowledgePort;
  readonly files: FilesPort;
  readonly webContent: WebContentPort;
  readonly knowledgeEvents: KnowledgeEventsPort;
  readonly connectors: ConnectorsPort;
  readonly secrets: SecretStore;
  readonly settings: SettingsPort;
  readonly catalog: SemanticQueryPort;
  readonly projects: ProjectsPort;
};
