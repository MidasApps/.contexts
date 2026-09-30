import { type DocumentData, FieldValue, type Query } from "firebase-admin/firestore";
import { type UpdateAuditFields, withUpdateAudit } from "./audit-fields.ts";

export type SoftDeleteFields = { deletedAt: FieldValue; deletedBy: string } & UpdateAuditFields;

/**
 * Fields a soft-deletable entity is created with. `deletedAt` must exist as
 * `null` (not be absent), or `notDeleted` queries would never match it.
 */
export const initialSoftDeleteFields = (): { deletedAt: null; deletedBy: null } => ({ deletedAt: null, deletedBy: null });

/**
 * Update that soft-deletes an entity (contracts/firebase-firestore.md §5).
 * @param actorId uid of the acting principal, or `SYSTEM_ACTOR`.
 */
export const softDeleteFields = (actorId: string): SoftDeleteFields =>
  withUpdateAudit({ deletedAt: FieldValue.serverTimestamp(), deletedBy: actorId }, actorId);

/** Restricts a query to live documents (`deletedAt == null`). */
export const notDeleted = <AppModel, DbModel extends DocumentData>(
  query: Query<AppModel, DbModel>,
): Query<AppModel, DbModel> => query.where("deletedAt", "==", null);
