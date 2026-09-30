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
export { configureProcessLogger, readProcessLogContext } from "./services/shared/observability/process-logger.ts";
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
