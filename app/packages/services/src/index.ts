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
export { createFirestoreUnitOfWork, inMemoryUnitOfWork, type UnitOfWork } from "./services/shared/firestore/unit-of-work.ts";
export { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "./services/shared/firestore/collections.ts";
export { decodeCursor, encodeCursor, type CursorPosition } from "./services/shared/pagination/cursor.ts";
export { pageMeta, paginateInMemory, type Page, type PageRequest } from "./services/shared/pagination/page.ts";
export { err, ok, type Result } from "./services/shared/result/result.ts";
// SP1 tenancy (Task 10): organizations, projects, the unit tree, regional settings.
export {
  createFirestoreTenancyAdapters,
  createInMemoryTenancyStore,
  createTenancyServices,
  createUnitTypeRegistry,
  type FirestoreTenancyAdapters,
  type InMemoryTenancyStore,
  InvalidUnitParentError,
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
