import {
  AuditLogEntryContract,
  AuditLogEntryIdSchema,
  PlatformAuditLogEntryContract,
} from "@core/contracts";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { withCreateAudit } from "../../../shared/firestore/audit-fields.ts";
import { createContractConverter } from "../../../shared/firestore/contract-converter.ts";
import type { AuditLogAppend, AuditLogWriter } from "../../application/ports/driven/audit-log-writer.ts";

/** Top-level, append-only collections (SP1 spec §4); no TTL until compliance.md is filled. */
export const AUDIT_LOG_COLLECTIONS = { tenant: "audit-logs", platform: "platform-audit-logs" } as const;

/** Stored shape version (contracts/firebase-firestore.md: `schemaVersion` starts at 1). */
export const AUDIT_LOG_SCHEMA_VERSION = 1;

const tenantConverter = createContractConverter(AuditLogEntryContract);
const platformConverter = createContractConverter(PlatformAuditLogEntryContract);

// The converters turn ISO date-times into Timestamp and drop `id` (the document id holds it).
const toDocument = (record: AuditLogAppend, id: string): DocumentData => {
  const entryId = AuditLogEntryIdSchema.parse(id);
  const data =
    record.log === "tenant"
      ? tenantConverter.toFirestore({ id: entryId, ...record.entry })
      : platformConverter.toFirestore({ id: entryId, ...record.entry });
  return withCreateAudit({ ...data, schemaVersion: AUDIT_LOG_SCHEMA_VERSION }, record.entry.actor.id);
};

/**
 * Firestore `AuditLogWriter`: one automatic-id document per entry, created with
 * `create` (never overwritten). Inside a transaction the entry commits with it.
 */
export const createFirestoreAuditLogWriter = (deps: { firestore: Firestore }): AuditLogWriter => ({
  append: async (record, tx) => {
    const ref = deps.firestore.collection(AUDIT_LOG_COLLECTIONS[record.log]).doc();
    const data = toDocument(record, ref.id);
    if (tx === undefined) await ref.create(data);
    else tx.create(ref, data);
    return AuditLogEntryIdSchema.parse(ref.id);
  },
});
