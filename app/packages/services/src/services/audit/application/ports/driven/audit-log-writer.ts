import type { AuditLogEntry, AuditLogEntryId, PlatformAuditLogEntry } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";

/**
 * The business transaction an entry joins (SP1 spec §6.7). Firestore is the only store
 * of the audit log (decision 0006), so the port names its transaction type directly.
 */
export type AuditTransaction = Transaction;

/** A validated entry, without the id the store assigns. */
export type AuditLogAppend =
  | { readonly log: "tenant"; readonly entry: Omit<AuditLogEntry, "id"> }
  | { readonly log: "platform"; readonly entry: Omit<PlatformAuditLogEntry, "id"> };

/** Driven port: appends one entry to the tenant (`audit-logs`) or platform log. Append-only. */
export type AuditLogWriter = {
  /** Writes inside `tx` when given (committed with it), otherwise on its own. */
  readonly append: (record: AuditLogAppend, tx?: AuditTransaction) => Promise<AuditLogEntryId>;
};
