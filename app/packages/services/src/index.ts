// Public API of @core/services. Explicit named re-exports only (no `export *`).
export {
  InvalidEnvError,
  type EnvIssue,
} from "./services/shared/env/invalid-env-error.ts";
export { toEnvIssues } from "./services/shared/env/env-issues.ts";
export { EnvKeyCollisionError, loadServicesEnvWith } from "./services/shared/env/load-services-env-with.ts";
export {
  loadServicesEnv,
  ServicesEnvSchema,
  type ServicesEnv,
} from "./services/shared/env/services-env.schema.ts";
export {
  createLogger,
  type LogContext,
  type LogFields,
  type Logger,
  type LogLevel,
  type LogRecord,
  type LogSink,
} from "./services/shared/observability/logger.ts";
export {
  applyCorsHeaders,
  CorsOriginListSchema,
  type CorsPolicy,
  createCorsPolicy,
  isCorsPreflight,
  preflightResponse,
} from "./services/shared/http/cors.ts";
export { type ErrorDetail, type ErrorEnvelope, errorResponse } from "./services/shared/http/error-envelope.ts";
export { type RouteContext, type RouteHandler, withRouteBoundary } from "./services/shared/http/route-boundary.ts";
export { configureProcessLogger, processLogger, readProcessLogContext } from "./services/shared/observability/process-logger.ts";
export {
  REQUEST_ID_HEADER,
  resolveRequestId,
} from "./services/shared/observability/request-id.ts";
export {
  createFirebaseAdmin,
  EmulatorOutsideLocalError,
  type FirebaseAdmin,
  type FirebaseAdminSdk,
  FirebaseProjectMismatchError,
} from "./services/shared/firebase/firebase-admin.ts";
export { createContractConverter, toFirestoreUpdate } from "./services/shared/firestore/contract-converter.ts";
export { CorruptDocumentError } from "./services/shared/firestore/corrupt-document-error.ts";
export {
  type CreateAuditFields,
  SYSTEM_ACTOR,
  type UpdateAuditFields,
  withCreateAudit,
  withUpdateAudit,
} from "./services/shared/firestore/audit-fields.ts";
export {
  initialSoftDeleteFields,
  notDeleted,
  type SoftDeleteFields,
  softDeleteFields,
} from "./services/shared/firestore/soft-delete.ts";
export { runInTransaction } from "./services/shared/firestore/transaction-runner.ts";
export {
  type DatabaseTarget,
  parseDatabaseUrl,
  type SocketDatabaseTarget,
  socketFilePath,
  type TcpDatabaseTarget,
} from "./services/shared/postgres/database-url.ts";
export {
  buildPostgresConnection,
  createPostgresClient,
  InvalidDatabaseUrlError,
  type PostgresConnection,
  type PostgresPoolOptions,
} from "./services/shared/postgres/postgres-client.ts";
export {
  InvalidNodeIdError,
  TenantContextMissingError,
  type TenantScope,
  withTenantTransaction,
} from "./services/shared/postgres/with-tenant-transaction.ts";
export { aiSchema } from "./services/shared/postgres/drizzle-schemas.ts";
export { type Clock, fixedClock, isAtOrBefore, systemClock } from "./services/shared/clock/clock.ts";
// SP1 access core: authorize() and its read model (SP3 reuses both).
export {
  type AccessCore,
  type AccessDeps,
  type AccessReaderCall,
  type AccessReaders,
  type ApiKeyStatusRecord,
  assertNoEscalation,
  type Authorize,
  type AuthorizeDecision,
  type AuthorizeRequest,
  type ChainNode,
  type ChainUnit,
  chainNodeIds,
  checkNodeChain,
  computeEffectivePermissions,
  CORE_PERMISSION_SOURCE,
  createAccessCore,
  createInMemoryAccessStore,
  createPermissionRegistry,
  createRequestScope,
  type CustomRoleRecord,
  type DenyReason,
  type DeviceStatusRecord,
  type EffectivePermissions,
  type EffectivePermissionsRequest,
  type EffectivePermissionsResult,
  type EscalationCheck,
  type GetEffectivePermissions,
  type GrantReader,
  type GrantRecord,
  type GrantSource,
  type ImpersonationSessionRecord,
  type InMemoryAccessStore,
  isNodeWithin,
  makeAuthorize,
  makeGetEffectivePermissions,
  type NodeChain,
  type NodeChainReader,
  type PermissionRegistry,
  PermissionRegistryError,
  type PermissionRegistryErrorCode,
  type PermissionSource,
  type PlatformStaffRecord,
  type PrincipalStatusReader,
  type RequestAccess,
  type RoleReader,
  type UserStatusRecord,
} from "./services/access/index.ts";
// SP1 access write side (Task 9): grants, custom roles, projections, claims.
export {
  AccessDeniedError,
  AccessNotFoundError,
  type AccessProjectionStore,
  type AccessServices,
  type AccessWriteDeps,
  buildAccessProjection,
  ClaimsTooLargeError,
  type ClaimsWriter,
  CORE_CLAIM_KEYS,
  type CoreClaims,
  createAccessServices,
  createFirestoreAccessAdapters,
  createInMemoryAccessWriteStore,
  EscalationForbiddenError,
  type FirestoreAccessAdapters,
  type GrantMembership,
  type GrantMembershipCommand,
  type GrantPlan,
  LastOwnerError,
  MembershipExistsError,
  type MembershipRepository,
  makeSyncClaims,
  type PrepareGrantArgs,
  type RoleRepository,
  RoleInUseError,
  type SyncClaims,
  UnknownPermissionError,
  UnknownRoleError,
  type UserAccessVersionStore,
} from "./services/access/index.ts";
// SP1 members and invitations (Task 11).
export {
  AppUrlMissingError,
  createFirebaseUserDirectory,
  createFirestoreInvitationRepository,
  createInMemoryInvitationRepository,
  createMemberServices,
  createNoopInvitationNotifier,
  EmailMismatchError,
  InvitationAlreadyUsedError,
  InvitationExpiredError,
  type InvitationNotifier,
  type InvitationRepository,
  type MemberDeps,
  type MemberServices,
  normalizeEmail,
  type UserDirectory,
} from "./services/access/index.ts";
// SP1 me vertical and the SP3 hook `resolveAccessContext` (Task 12).
export {
  AccountMissingError,
  type ApiKeyRevoker,
  createIdentityServices,
  createInMemoryUserRepository,
  type IdentityServices,
  noopApiKeyRevoker,
  type ResolveAccessContext,
  type ResolvedAccessContext,
  type UserRepository,
} from "./services/identity/index.ts";
// SP1 web and desktop sessions (Task 13).
export {
  createSessionServices,
  makeSessionActions,
  makeSessionGuards,
  SESSION_COOKIE_NAME,
  type CookieJar,
  type SessionActionContext,
  type SessionActionResult,
  type SessionActions,
  type SessionGuards,
  type SessionServices,
  type StaffSessionGuardResult,
  type WebSessionGuardResult,
} from "./services/identity/index.ts";
// SP1 scoped API keys (Task 14).
export { createApiKeyServices, parseApiKey, type ApiKeyServices } from "./services/identity/index.ts";
// SP1 device activations and devices (Task 15).
export { createDeviceServices, normalizeActivationCode, type DeviceServices } from "./services/identity/index.ts";
// SP1 platform staff and read-only impersonation (Task 16): SP2 guards, SP5 /admin.
export { createPlatformServices, ImpersonationNotFoundError, type ImpersonatedRequest, type PlatformServices } from "./services/identity/index.ts";
// SP1 four-eyes approval requests (Task 17): SP3 registers `agent-command`, SP5 its workflow handler.
export {
  createApprovalHandlerRegistry,
  createApprovalServices,
  type ApprovalActionContext,
  type ApprovalActionHandler,
  type ApprovalHandlerRegistry,
  type ApprovalServices,
  type RequestApproval,
} from "./services/access/index.ts";
// SP1 tenant audit log listing (Task 18): the SP5 audit viewer.
export { createFirestoreAuditLogServices, type AuditLogServices, type ListAuditLogs } from "./services/audit/index.ts";
// Re-exported for operator scripts (`pnpm platform:grant-staff`), which depend on services only.
export { PLATFORM_ROLES, PlatformRoleSchema, UserIdSchema, type PlatformRole } from "@core/contracts";
// Re-exported for `pnpm seed:local`, which parses the ids it passes to the use cases.
export { OrganizationIdSchema, ProjectIdSchema, UnitIdSchema } from "@core/contracts";
export { createFirestoreUnitOfWork, inMemoryUnitOfWork, type UnitOfWork } from "./services/shared/firestore/unit-of-work.ts";
export { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "./services/shared/firestore/collections.ts";
export { decodeCursor, encodeCursor, type CursorPosition } from "./services/shared/pagination/cursor.ts";
export { pageMeta, paginateInMemory, type Page, type PageRequest } from "./services/shared/pagination/page.ts";
export { err, ok, type Result } from "./services/shared/result/result.ts";
// SP1 tenancy (Task 10): organizations, projects, the unit tree, regional settings.
export {
  CORE_UNIT_TYPE_ID,
  CORE_UNIT_TYPES,
  createFirestoreTenancyAdapters,
  createInMemoryTenancyStore,
  createTenancyServices,
  createUnitTypeRegistry,
  type FirestoreTenancyAdapters,
  type InMemoryTenancyStore,
  InvalidUnitParentError,
  type LoadNode,
  type NodeDetails,
  regionalSettingsAt,
  type InvalidUnitParentReason,
  MAX_SUBTREE_REWRITE,
  type OrganizationRepository,
  type ProjectRepository,
  resolveRegionalSettings,
  type ResolveNodeRegionalSettings,
  SubtreeTooLargeError,
  type TenancyDeps,
  TenancyNotFoundError,
  type TenancyServices,
  type UnitRepository,
  type UnitTypeRegistry,
  UnitTypeRegistryError,
  UserAccountMissingError,
} from "./services/tenancy/index.ts";
export { createFirebaseUserAccountReader } from "./services/identity/adapters/driven/firebase-user-account-reader.ts";
export type { UserAccountReader } from "./services/identity/application/ports/driven/user-account-reader.ts";
// SP1 audit writer, rate limiter and idempotency store (Task 7).
export {
  AUDIT_LOG_COLLECTIONS,
  AUDIT_LOG_SCHEMA_VERSION,
  AuditEntryRejectedError,
  createAuditServices,
  createFirestoreAuditLogWriter,
  createInMemoryAuditLogWriter,
  makeRecordAudit,
  type AuditEntryRejectedCode,
  type AuditLogAppend,
  type AuditLogWriter,
  type AuditRecordInput,
  type AuditServices,
  type AuditTransaction,
  type AuditWriter,
  type InMemoryAuditLogWriter,
  type PlatformAuditRecordInput,
  type TenantAuditRecordInput,
} from "./services/audit/index.ts";
export { sha256Hex } from "./services/shared/crypto/sha256.ts";
export {
  getRateLimitPolicy,
  RATE_LIMIT_POLICIES,
  UnknownRateLimitPolicyError,
  type RateLimitPolicy,
  type RateLimitPolicyId,
} from "./services/shared/rate-limit/rate-limit-policies.ts";
export { rateLimitBucketId, type RateLimitDecision, type RateLimiter } from "./services/shared/rate-limit/rate-limiter.ts";
export { createFirestoreRateLimiter, RATE_LIMIT_BUCKETS_COLLECTION } from "./services/shared/rate-limit/firestore-rate-limiter.ts";
export { createInMemoryRateLimiter } from "./services/shared/rate-limit/in-memory-rate-limiter.ts";
export { rateLimitedResponse, rateLimitHeaders } from "./services/shared/rate-limit/rate-limit-headers.ts";
export {
  idempotencyScopeKey,
  type IdempotencyBegin,
  type IdempotencyStore,
  type StoredResponse,
} from "./services/shared/idempotency/idempotency-store.ts";
export { createFirestoreIdempotencyStore, IDEMPOTENCY_RECORDS_COLLECTION } from "./services/shared/idempotency/firestore-idempotency-store.ts";
export { createInMemoryIdempotencyStore } from "./services/shared/idempotency/in-memory-idempotency-store.ts";
export { canonicalJson, hashRequest } from "./services/shared/idempotency/request-hash.ts";
// SP1 /v1 pipeline and principal resolution (Task 8).
export {
  createFakeTokenVerifier,
  createFirebaseTokenVerifier,
  isApiKeyCredential,
  makeResolvePrincipal,
  makeVerifyBearer,
  mapTokenToPrincipal,
  parseBearer,
  refuseAllApiKeys,
  requiresRevocationCheck,
  type ApiKeyAuthenticator,
  type FakeTokenVerifier,
  type ResolvePrincipal,
  type ResolvePrincipalDeps,
  type TokenVerifier,
  type VerifiedToken,
  type VerifyBearer,
} from "./services/identity/index.ts";
export { operationName, withApiRoute, type ApiRouteDeps } from "./services/shared/http/api-route.ts";
export type { ApiHandler, ApiHandlerContext, EndpointPrincipal } from "./services/shared/http/api-handler-context.ts";
export { apiError, dataResponse, type DomainErrorMapping, mapDomainError, noContentResponse } from "./services/shared/http/api-errors.ts";
export { matchPathParams } from "./services/shared/http/path-params.ts";
export { clientIpOf } from "./services/shared/http/client-ip.ts";
// SP3 catalog context: semantic view registry and read-only SQL runner (Task 11).
export {
  createBigQuerySemanticRunner,
  createPostgresSemanticRunner,
  createSemanticViewRegistry,
  DEFAULT_SEMANTIC_LIMIT,
  DEFAULT_STATEMENT_TIMEOUT_MS,
  guardConnectorSql,
  guardSemanticSql,
  InvalidSemanticViewError,
  makeRunSemanticQuery,
  MAX_SEMANTIC_LIMIT,
  MAX_SEMANTIC_PARAMS,
  MAX_SQL_LENGTH,
  SEMANTIC_READER_ROLE,
  SEMANTIC_SCHEMA,
  wrapWithLimit,
  type GuardedSql,
  type RunSemanticQuery,
  type RunSemanticQueryError,
  type RunSemanticQueryInput,
  type SemanticQueryPrincipal,
  type SemanticQueryResult,
  type SemanticQueryRows,
  type SemanticQueryRunner,
  type SemanticQueryScope,
  type SemanticRunnerFailure,
  type SemanticSqlGuard,
  type SemanticView,
  type SemanticViewRegistry,
  type SqlParam,
  type SqlRejection,
  type SqlRejectionReason,
} from "./services/catalog/index.ts";
// SP2 module settings store (Task 9, decision 0015 §6).
export {
  buildModuleSettingsRoutes,
  createFirestoreModuleSettingsRepository,
  createFirestoreModuleSettingsServices,
  createInMemoryModuleSettingsRepository,
  createModuleSettingsRegistry,
  InvalidModuleSettingsError,
  MODULE_SETTINGS_COLLECTION,
  moduleSettingsDefinitionsOf,
  moduleSettingsDocId,
  ModuleSettingsRegistryError,
  UnknownModuleError,
  createModuleSettingsServices,
  type GetModuleSettings,
  type InMemoryModuleSettingsRepository,
  type ModuleSettingsDefinition,
  type ModuleSettingsKey,
  type ModuleSettingsRegistry,
  type ModuleSettingsRepository,
  type ModuleSettingsServices,
  type StoredModuleSettings,
  type UpdateModuleSettings,
  type UpdateModuleSettingsCommand,
} from "./services/modules/index.ts";
// SP3 agents context: the /v1 → Mastra gateway (Task 8).
export {
  createMastraGateway,
  createServerlessIdTokenSource,
  DEFAULT_GATEWAY_TIMEOUTS,
  gatewayErrorResponse,
  mapMastraStatus,
  ServerlessIdTokenError,
  type AgentCallScope,
  type AgentMessage,
  type AgentRunInput,
  type AgentRunOptions,
  type AgentRuntimeGateway,
  type GatewayError,
  type GatewayErrorCode,
  type GatewayResult,
  type GatewayStream,
  type IdTokenMinter,
  type MastraGatewayOptions,
  type ServerlessIdTokenSource,
  type ThreadInput,
  type ToolCallDecisionInput,
  type WorkflowResumeInput,
  type WorkflowStartInput,
} from "./services/agents/index.ts";
// SP3 core MCP server entry `/v1/mcp` (Task 24).
export {
  buildMcpRoutes,
  CORE_MCP_SERVER,
  MCP_REQUEST_HEADERS,
  MCP_USE_PERMISSION,
  mcpHeadersOf,
  type McpCallInput,
  type McpGatewayResponse,
} from "./services/agents/index.ts";
// SP3 agent commands: the SP1 `agent-command` approval handler and command idempotency (follow-up #26).
export {
  AGENT_COMMAND_HANDLER_KIND,
  AgentCommandError,
  agentCommandExecutors,
  CREATE_PROJECT_COMMAND_ID,
  createAgentCommandApprovalHandler,
  createCommandIdempotency,
  createCoreAgentCommandExecutors,
  defineAgentCommandExecutor,
  registerAgentCommandApprovals,
  type AgentCommandApprovalDeps,
  type AgentCommandErrorCode,
  type AgentCommandExecution,
  type AgentCommandExecutor,
  type AgentCommandExecutors,
  type AgentCommandExecutorSpec,
  type CommandIdempotency,
  type CommandRun,
  type CommandRunResult,
} from "./services/agents/index.ts";
// SP3 knowledge context: documents, chunks and search with tenant row security (Task 12).
export {
  CHUNKS_V1_DIMENSIONS,
  createPostgresKnowledgeRepository,
  DocumentRefInputSchema,
  InvalidEmbeddingError,
  KNOWLEDGE_RUNTIME_ROLE,
  knowledgeChunksV1,
  knowledgeDocuments,
  ListDocumentsInputSchema,
  buildKnowledgeDocumentsRoutes,
  buildKnowledgeSourcesRoutes,
  createKnowledgeServices,
  createLogKnowledgeEventPublisher,
  KNOWLEDGE_DELETE_PERMISSION,
  KNOWLEDGE_INGEST_WORKFLOW,
  KNOWLEDGE_READ_PERMISSION,
  KNOWLEDGE_WRITE_PERMISSION,
  makeDeleteDocument,
  makeGetDocument,
  makeListDocuments,
  makeRegisterDocument,
  makeReplaceDocumentChunks,
  makeSearchChunks,
  MAX_CHUNKS_PER_DOCUMENT,
  MAX_SEARCH_NAMESPACES,
  MAX_SEARCH_TOP_K,
  MIN_CITATION_SCORE,
  RegisterDocumentInputSchema,
  ReplaceDocumentChunksInputSchema,
  SearchChunksInputSchema,
  toVectorLiteral,
  type ChunkMatch,
  type DeleteDocument,
  type DocumentPage,
  type DocumentRefInput,
  type GetDocument,
  type KnowledgeDocumentIndexedEvent,
  type KnowledgeDocumentsServices,
  type KnowledgeInputError,
  type KnowledgeServices,
  type KnowledgeRepository,
  type ListDocuments,
  type ListDocumentsInput,
  type NewChunk,
  type NewKnowledgeDocument,
  type RegisterDocument,
  type RegisterDocumentInput,
  type ReplaceDocumentChunks,
  type ReplaceDocumentChunksInput,
  type SearchChunks,
  type SearchChunksInput,
  type UpsertedDocument,
} from "./services/knowledge/index.ts";
// SP3 files context: signed URL uploads and magic-byte validation (Task 13).
export {
  buildFilesRoutes,
  checkUpload,
  contentMatchesDeclared,
  createEmulatorUrlSigner,
  createFakeUrlSigner,
  createFilesServices,
  createFirebaseFilesServices,
  createFirestoreFileRepository,
  createGcsObjectStore,
  createGcsUrlSigner,
  createInMemoryFileRepository,
  createInMemoryObjectStore,
  createLogFileEventPublisher,
  createRecordingFileEvents,
  detectContentType,
  EmulatorSignerOutsideLocalError,
  FILE_CATEGORIES,
  FILES_COLLECTION,
  filesBucketOf,
  makeCreateReadUrl,
  makeFinalizeUpload,
  makeGetFile,
  makeGetReadyFile,
  makeObjectFinalizedHandler,
  makeReadFileBytes,
  makeRequestUpload,
  parseStoragePath,
  PURPOSE_CATEGORIES,
  READ_URL_TTL_MS,
  resolveUploadRule,
  SNIFF_BYTES,
  storagePathOf,
  UPLOAD_URL_TTL_MS,
  type CreateReadUrl,
  type DetectContentType,
  type FileCategory,
  type FileEventPublisher,
  type FileObjectStore,
  type FileRepository,
  type FileSettlement,
  type FilesAdapters,
  type FilesEnv,
  type FilesServices,
  type FileUploadedEvent,
  type FileUrlSigner,
  type FinalizedObject,
  type FinalizeOutcome,
  type FinalizeUpload,
  type GetFile,
  type GetReadyFile,
  type ObjectFinalizedData,
  type ReadFileBytes,
  type ReadFileBytesError,
  type RequestUpload,
  type RequestUploadError,
  type StorageBucket,
  type UploadRule,
} from "./services/files/index.ts";
// SP3 usage context: LLM usage ledger, tenant budgets and the warehouse sink (Task 16).
export {
  ALERT_THRESHOLD_PERCENT,
  BIGQUERY_INSERT_BATCH,
  BudgetTenantMissingError,
  createBigQueryLlmCallsTable,
  createBigQueryUsageSink,
  createNoopUsageSink,
  createPostgresUsageRepository,
  createUsageServices,
  createUsageSink,
  DEFAULT_PLAN_BUDGET,
  evaluateBudget,
  GetUsageSummaryInputSchema,
  LLM_CALLS_TABLE,
  makeCheckTenantBudget,
  makeGetUsageSummary,
  makeRecordLlmCalls,
  MAX_LLM_CALLS_PER_BATCH,
  resolveBudget,
  toBigQueryRow,
  USAGE_RUNTIME_ROLE,
  usageLlmCalls,
  usageTenantBudgets,
  utcMonthStart,
  type BigQueryLlmCallRow,
  type BigQueryTableLike,
  type Budget,
  type BudgetDecision,
  type CheckTenantBudget,
  type GetUsageSummary,
  type GetUsageSummaryInput,
  type ModelTotals,
  type MonthSpend,
  type RecordLlmCalls,
  type StoredBudget,
  type UsageRepository,
  type UsageServices,
  type UsageSink,
  type UsageTotals,
  type UsageValidationError,
} from "./services/usage/index.ts";
// SP3 connectors context (Task 21): tenant connectors, secret store, `/v1/.../connectors`.
export {
  buildConnectorsRoutes,
  CONNECTOR_READ_PERMISSION,
  CONNECTOR_WRITE_PERMISSION,
  connectorHostIssues,
  ConnectorNotFoundError,
  CONNECTORS_COLLECTION,
  connectorSecretName,
  createConnectorsServices,
  createFirebaseConnectorsServices,
  createFirestoreConnectorRepository,
  createInMemoryConnectorRepository,
  createInMemorySecretStore,
  createLazySecretManagerClient,
  createLocalSecretStore,
  createSecretManagerStore,
  createSecretStoreFor,
  InvalidConnectorError,
  LOCAL_SECRETS_COLLECTION,
  LocalSecretStoreOutsideLocalError,
  type ConnectorRepository,
  type ConnectorsCommand,
  type ConnectorsDeps,
  type ConnectorsServices,
  type SecretManagerClientLike,
  type SecretStore as ConnectorSecretStore,
} from "./services/connectors/index.ts";
// SP5 workflows: HITL on SP1 approval requests (decision 0036).
export {
  createMastraWorkflowApprovalSettler,
  createWorkflowResumeApprovalHandler,
  DEFAULT_SETTLE_TIMEOUT_MS,
  makeSettleOnApprovalUpdate,
  registerWorkflowApprovals,
  TRIGGER_SETTLED_STATUSES,
  WORKFLOW_RESUME_HANDLER_KIND,
  WorkflowApprovalError,
  type ApprovalUpdate,
  type MastraWorkflowApprovalSettlerOptions,
  type SettleOnUpdateOutcome,
  type SettleOutcome,
  type WorkflowApprovalErrorCode,
  type WorkflowApprovalSettler,
} from "./services/workflows/index.ts";
// Functions: the approval trigger test writes SP1 requests through the same adapter.
export { createFirestoreApprovalRequestRepository } from "./services/access/index.ts";
// SP5 workflow runs, progress stream and tenant schedules (decisions 0037, 0040).
export {
  buildSchedulesRoutes,
  buildWorkflowRunsRoutes,
  buildWorkflowRunStreamRoutes,
  createMastraWorkflowGateway,
  WORKFLOW_RUN_PERMISSIONS,
  type WorkflowGatewayResult,
  type WorkflowRuntimeGateway,
} from "./services/workflows/index.ts";
// SP5 usage report (decision 0039): rollups, warehouse export, budget alerts; live tenant ids.
export {
  BUDGET_ALERT_THRESHOLDS,
  type BudgetAlertThreshold,
  createPostgresUsageReportRepository,
  makeReportTenantUsage,
  type ReportTenantUsage,
  type TenantUsageReport,
  type UsageReportRepository,
} from "./services/usage/index.ts";
export { listLiveOrganizationIds } from "./services/tenancy/adapters/driven/firestore-live-organization-ids.ts";
// SP4 conversations context (Tasks 4–6): chat conversation metadata, `/v1/chat` and `/v1/conversations`.
export {
  ACTIVE_RUN_TTL_MS,
  buildSearchTokens,
  CONVERSATIONS_COLLECTION,
  createConversationsServices,
  createFirestoreConversationRepository,
  createFirestoreConversationsServices,
  createInMemoryConversationRepository,
  MAX_ACTIVE_STREAMS_PER_TENANT,
  queryTokens,
  type ActiveRuns,
  type ConversationRepository,
  type ConversationsServices,
  type InMemoryConversationRepository,
  buildChatRoutes,
  buildConversationsRoutes,
  type ChatRoutesDeps,
} from "./services/conversations/index.ts";
export {
  buildVoiceRoutes,
  CHAT_ROUTES,
  createMastraChatGateway,
  createMastraVoiceGateway,
  type ChatRuntimeGateway,
  type ChatStreamAnswer,
  type VoiceRoutesDeps,
  type VoiceRuntimeGateway,
} from "./services/agents/index.ts";
// SP5 maintenance workflows (Task 7): conversation purge and eval export.
export type { DeletedConversation, DeletedConversationStore } from "./services/conversations/application/ports/deleted-conversation-store.ts";
export {
  makePurgeDeletedConversations,
  PURGE_AFTER_DAYS,
  type PurgeDeletedConversations,
} from "./services/conversations/application/use-cases/purge-deleted-conversations.ts";
export { createFirestoreDeletedConversationStore } from "./services/conversations/adapters/driven/firestore-deleted-conversation-store.ts";
export {
  type BigQueryEvalRunRow,
  createBigQueryEvalRunSink,
  createNoopEvalRunSink,
  EVAL_RUNS_TABLE,
  type EvalRunSink,
  type EvalRunsTableLike,
  toEvalRunRows,
} from "./services/evals/index.ts";
// SP5 feature flags (Task 8, decision 0039): registry, Remote Config / Firestore stores, `/v1` routes.
export {
  buildAdminFlagsRoutes,
  buildFlagsRoutes,
  CORE_FLAGS,
  createFirebaseFlagsServices,
  createFlagsServices,
  createFlagStoresFor,
  createInMemoryFlagStores,
  expiredFlags,
  FEATURE_FLAG_OVERRIDES_COLLECTION,
  FEATURE_FLAGS_COLLECTION,
  FLAG_PERMISSIONS,
  findFlag,
  flagEnvironmentDefaults,
  isFlagExpired,
  remoteConfigParameterOf,
  type EnvironmentFlagValues,
  type FlagsServices,
  type FlagStores,
  type GetFlagValues,
  type RegisteredFlag,
  type RemoteConfigClient,
  type TenantFlagOverrides,
} from "./services/flags/index.ts";
export { requireStaff, requireTenant } from "./services/platform/adapters/driving/console-guards.ts";
// SP5 staff console (Task 10, decisions 0039 and 0041): plans, organizations, budgets, agent settings.
export {
  AGENT_SETTINGS_COLLECTION,
  buildAdminPlatformRoutes,
  CONSOLE_PERMISSIONS,
  createConsoleServices,
  createFirebaseConsoleServices,
  createFirestoreAgentSettingsRepository,
  createInMemoryConsoleStores,
  createPostgresConsoleUsage,
  defaultAgentSettingsOf,
  ORGANIZATION_PLANS_COLLECTION,
  PLANS_COLLECTION,
  syncTenantBudget,
  type AgentSettingsRepository,
  type ConsoleServices,
} from "./services/platform/index.ts";
export { AGENT_SETTINGS_PERMISSIONS, buildAgentSettingsRoutes } from "./services/agents/adapters/driving/agent-settings-route-handler.ts";
export { resolveTenantCaps, selfCapWithin, type TenantCaps } from "./services/usage/domain/budget-policy.ts";
// SP5 prompt store (Task 9, decision 0038): append-only Postgres versions and activations, eval gate.
export { buildPromptRoutes, PROMPT_PERMISSIONS } from "./services/agents/adapters/driving/prompts-route-handler.ts";
export { createInMemoryPromptRepository } from "./services/agents/adapters/driven/in-memory-prompt-repository.ts";
export { createMastraPromptEvalGateway } from "./services/agents/adapters/driven/mastra-prompt-eval-gateway.ts";
export { createPostgresPromptRepository, PLATFORM_PROMPT_SCOPE, PROMPTS_RUNTIME_ROLE } from "./services/agents/adapters/driven/postgres-prompt-repository.ts";
export type { PromptEvalError, PromptEvalGateway } from "./services/agents/application/ports/prompt-eval-gateway.ts";
export type { ActivePrompts, PromptKey, PromptRepository } from "./services/agents/application/ports/prompt-repository.ts";
export { createPostgresPromptServices, createPromptServices, type PromptServices } from "./services/agents/prompt-composition.ts";
// SP5 traces, evals and feedback (Task 11, decision 0040): the runtime's console routes behind /v1.
export { buildObservabilityRoutes, OBSERVABILITY_PERMISSIONS } from "./services/observability/adapters/driving/traces-route-handler.ts";
export { createMastraConsoleGateway } from "./services/observability/adapters/driven/mastra-traces-reader.ts";
export type { ConsoleError, ConsoleGateway, ConsoleResult } from "./services/observability/application/ports/console-gateway.ts";
export { createObservabilityServices, type ObservabilityServices } from "./services/observability/composition.ts";
export { buildFeedbackRoutes } from "./services/conversations/adapters/driving/feedback-route-handler.ts";
export {
  createFirestoreMessageFeedbackStore,
  createInMemoryMessageFeedbackStore,
  MESSAGE_FEEDBACK_COLLECTION,
} from "./services/conversations/adapters/driven/firestore-message-feedback-store.ts";
export { feedbackKeyOf } from "./services/conversations/application/use-cases/record-message-feedback.ts";
