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
} from "./services/shared/firebase/firebase-admin.ts";
export { createContractConverter } from "./services/shared/firestore/contract-converter.ts";
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
