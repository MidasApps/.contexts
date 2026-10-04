import { type AuditLogEntry, AuditLogEntryContract } from "@core/contracts";
import { FieldPath, type Firestore, Timestamp } from "firebase-admin/firestore";
import { createContractConverter } from "#/services/shared/firestore/contract-converter.ts";
import { pageFromOverfetch } from "#/services/shared/pagination/page.ts";
import type { AuditLogReader } from "../../application/ports/driven/audit-log-reader.ts";
import { AUDIT_LOG_COLLECTIONS } from "./firestore-audit-log-writer.ts";

const converter = createContractConverter(AuditLogEntryContract);

const at = (iso: string): Timestamp => Timestamp.fromDate(new Date(iso));

/**
 * Firestore `AuditLogReader` over `audit-logs`: equality on `tenantId` (+ `action`, `actor.id`),
 * an exclusive `occurredAt` window, ordered `occurredAt desc, id desc` (composite indexes in
 * `firestore.indexes.json`). Reads parse with the entry contract.
 */
export const createFirestoreAuditLogReader = (deps: { firestore: Firestore }): AuditLogReader => ({
  list: async ({ tenantId, filters, page }) => {
    let query = deps.firestore
      .collection(AUDIT_LOG_COLLECTIONS.tenant)
      .withConverter(converter)
      .where("tenantId", "==", tenantId);
    if (filters.action !== undefined) query = query.where("action", "==", filters.action);
    if (filters.actorId !== undefined) query = query.where("actor.id", "==", filters.actorId);
    if (filters.occurredAfter !== undefined) query = query.where("occurredAt", ">", at(filters.occurredAfter));
    if (filters.occurredBefore !== undefined) query = query.where("occurredAt", "<", at(filters.occurredBefore));
    query = query.orderBy("occurredAt", "desc").orderBy(FieldPath.documentId(), "desc");
    if (page.after !== undefined) query = query.startAfter(at(page.after[0]), page.after[1]);
    const fetched = (await query.limit(page.limit + 1).get()).docs.map((doc) => doc.data());
    return pageFromOverfetch({
      fetched,
      limit: page.limit,
      positionOf: (entry: AuditLogEntry) => [entry.occurredAt, entry.id],
    });
  },
});
