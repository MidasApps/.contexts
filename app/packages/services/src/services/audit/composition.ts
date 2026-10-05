// Composition root of the audit context: the AuditWriter (SP1 Task 7) and the tenant audit
// log listing (SP1 Task 18), bound to Firestore.
import type { Firestore } from "firebase-admin/firestore";
import { type Clock, systemClock } from "../shared/clock/clock.ts";
import { createFirestoreAuditLogReader } from "./adapters/driven/firestore-audit-log-reader.ts";
import { createFirestoreAuditLogWriter } from "./adapters/driven/firestore-audit-log-writer.ts";
import type { AuditLogReader } from "./application/ports/driven/audit-log-reader.ts";
import { type ListAuditLogs, makeListAuditLogs } from "./application/use-cases/list-audit-logs.ts";
import { type AuditWriter, makeRecordAudit } from "./application/use-cases/record-audit.ts";

export type AuditServices = { readonly audit: AuditWriter };

/** Read side of the audit logs: the tenant one (the SP5 audit viewer) and the platform one (staff). */
export type AuditLogServices = {
  readonly listAuditLogs: ListAuditLogs;
  /** Unauthorized read: the `/v1/admin/audit-logs` handler requires `platform.audit-log.read` first. */
  readonly listPlatformAuditLogs: AuditLogReader["listPlatform"];
};

/** Wires the audit writer (SP1 Task 7). */
export const createAuditServices = (args: { firestore: Firestore; clock?: Clock }): AuditServices => ({
  audit: makeRecordAudit({
    writer: createFirestoreAuditLogWriter({ firestore: args.firestore }),
    clock: args.clock ?? systemClock,
  }),
});

/** Wires the tenant audit log listing over Firestore (SP1 Task 18). */
export const createFirestoreAuditLogServices = (args: { firestore: Firestore }): AuditLogServices => {
  const reader = createFirestoreAuditLogReader({ firestore: args.firestore });
  return { listAuditLogs: makeListAuditLogs({ reader }), listPlatformAuditLogs: reader.listPlatform };
};
