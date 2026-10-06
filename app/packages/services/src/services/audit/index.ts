// Public API of the audit context (SP1 Task 7): tenant and platform audit logs.

export { createFirestoreAuditLogReader } from "./adapters/driven/firestore-audit-log-reader.ts";
export {
  AUDIT_LOG_COLLECTIONS,
  AUDIT_LOG_SCHEMA_VERSION,
  createFirestoreAuditLogWriter,
} from "./adapters/driven/firestore-audit-log-writer.ts";
export { createInMemoryAuditLogReader } from "./adapters/driven/in-memory-audit-log-reader.ts";
export {
  createInMemoryAuditLogWriter,
  type InMemoryAuditLogWriter,
} from "./adapters/driven/in-memory-audit-log-writer.ts";
export { buildAuditLogsRoutes } from "./adapters/driving/audit-logs-routes.ts";
export type { AuditLogFilters, AuditLogReader } from "./application/ports/driven/audit-log-reader.ts";
export type { AuditLogAppend, AuditLogWriter, AuditTransaction } from "./application/ports/driven/audit-log-writer.ts";
export {
  type ListAuditLogs,
  type ListAuditLogsCommand,
  makeListAuditLogs,
} from "./application/use-cases/list-audit-logs.ts";
export {
  type AuditRecordInput,
  type AuditWriter,
  makeRecordAudit,
  type PlatformAuditRecordInput,
  type TenantAuditRecordInput,
} from "./application/use-cases/record-audit.ts";
export {
  type AuditLogServices,
  type AuditServices,
  createAuditServices,
  createFirestoreAuditLogServices,
} from "./composition.ts";
export { type AuditActor, auditActorOf } from "./domain/audit-actor.ts";
export { type AuditEntryRejectedCode, AuditEntryRejectedError } from "./domain/audit-entry-rejected-error.ts";
