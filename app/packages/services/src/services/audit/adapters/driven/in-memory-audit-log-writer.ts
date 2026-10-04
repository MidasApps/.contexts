import { type AuditLogEntry, AuditLogEntryIdSchema, type PlatformAuditLogEntry } from "@core/contracts";
import type { AuditLogWriter, AuditTransaction } from "../../application/ports/driven/audit-log-writer.ts";

export type InMemoryAuditLogWriter = AuditLogWriter & {
  readonly entries: {
    (log: "tenant"): readonly AuditLogEntry[];
    (log: "platform"): readonly PlatformAuditLogEntry[];
  };
  /** Transactions passed to `append`, in order (checks that callers join their transaction). */
  readonly transactions: () => readonly AuditTransaction[];
};

/** In-memory `AuditLogWriter` for unit tests; ids are `audit-1`, `audit-2`, … */
export const createInMemoryAuditLogWriter = (): InMemoryAuditLogWriter => {
  const tenant: AuditLogEntry[] = [];
  const platform: PlatformAuditLogEntry[] = [];
  const transactions: AuditTransaction[] = [];
  let sequence = 0;
  const entries = ((log: "tenant" | "platform") =>
    log === "tenant" ? [...tenant] : [...platform]) as InMemoryAuditLogWriter["entries"];
  return {
    append: (record, tx) => {
      sequence += 1;
      const id = AuditLogEntryIdSchema.parse(`audit-${sequence}`);
      if (record.log === "tenant") tenant.push({ id, ...record.entry });
      else platform.push({ id, ...record.entry });
      if (tx !== undefined) transactions.push(tx);
      return Promise.resolve(id);
    },
    entries,
    transactions: () => [...transactions],
  };
};
