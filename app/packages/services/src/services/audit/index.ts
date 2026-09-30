// Public API of the audit context (SP1 Task 7): tenant and platform audit logs.
export { createAuditServices, type AuditServices } from "./composition.ts";
export {
  makeRecordAudit,
  type AuditRecordInput,
  type AuditWriter,
  type PlatformAuditRecordInput,
  type TenantAuditRecordInput,
} from "./application/use-cases/record-audit.ts";
export type { AuditLogAppend, AuditLogWriter, AuditTransaction } from "./application/ports/driven/audit-log-writer.ts";
export { AuditEntryRejectedError, type AuditEntryRejectedCode } from "./domain/audit-entry-rejected-error.ts";
export {
  AUDIT_LOG_COLLECTIONS,
  AUDIT_LOG_SCHEMA_VERSION,
  createFirestoreAuditLogWriter,
} from "./adapters/driven/firestore-audit-log-writer.ts";
export { createInMemoryAuditLogWriter, type InMemoryAuditLogWriter } from "./adapters/driven/in-memory-audit-log-writer.ts";
