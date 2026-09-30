// Composition root of the audit context: the AuditWriter (SP1 Task 7) and the tenant audit
// log listing (SP1 Task 18), bound to Firestore.
import type { Firestore } from "firebase-admin/firestore";
import { systemClock, type Clock } from "../shared/clock/clock.ts";
import { createFirestoreAuditLogReader } from "./adapters/driven/firestore-audit-log-reader.ts";
import { createFirestoreAuditLogWriter } from "./adapters/driven/firestore-audit-log-writer.ts";
import { makeListAuditLogs, type ListAuditLogs } from "./application/use-cases/list-audit-logs.ts";
import { makeRecordAudit, type AuditWriter } from "./application/use-cases/record-audit.ts";

export type AuditServices = { readonly audit: AuditWriter };

/** Read side of the tenant audit log (the SP5 audit viewer). */
export type AuditLogServices = { readonly listAuditLogs: ListAuditLogs };

/** Wires the audit writer (SP1 Task 7). */
export const createAuditServices = (args: { firestore: Firestore; clock?: Clock }): AuditServices => ({
  audit: makeRecordAudit({ writer: createFirestoreAuditLogWriter({ firestore: args.firestore }), clock: args.clock ?? systemClock }),
});

/** Wires the tenant audit log listing over Firestore (SP1 Task 18). */
export const createFirestoreAuditLogServices = (args: { firestore: Firestore }): AuditLogServices => ({
  listAuditLogs: makeListAuditLogs({ reader: createFirestoreAuditLogReader({ firestore: args.firestore }) }),
});
