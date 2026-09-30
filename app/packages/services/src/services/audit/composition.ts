// Composition root of the audit context: binds the AuditWriter use case to Firestore.
import type { Firestore } from "firebase-admin/firestore";
import { systemClock, type Clock } from "../shared/clock/clock.ts";
import { createFirestoreAuditLogWriter } from "./adapters/driven/firestore-audit-log-writer.ts";
import { makeRecordAudit, type AuditWriter } from "./application/use-cases/record-audit.ts";

export type AuditServices = { readonly audit: AuditWriter };

/** Wires the audit writer (SP1 Task 7); the audit log read API arrives in Task 18. */
export const createAuditServices = (args: { firestore: Firestore; clock?: Clock }): AuditServices => ({
  audit: makeRecordAudit({ writer: createFirestoreAuditLogWriter({ firestore: args.firestore }), clock: args.clock ?? systemClock }),
});
