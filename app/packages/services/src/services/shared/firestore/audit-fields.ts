import { FieldValue } from "firebase-admin/firestore";

/** Actor id for automated writes (contracts/firebase-firestore.md §5). */
export const SYSTEM_ACTOR = "system";

export type CreateAuditFields = {
  createdAt: FieldValue;
  updatedAt: FieldValue;
  createdBy: string;
  updatedBy: string;
};

export type UpdateAuditFields = Pick<CreateAuditFields, "updatedAt" | "updatedBy">;

/**
 * Adds the create audit fields; both timestamps come from the server clock.
 * @param actorId uid of the acting principal, or `SYSTEM_ACTOR`.
 */
export const withCreateAudit = <T extends object>(data: T, actorId: string): T & CreateAuditFields => ({
  ...data,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  createdBy: actorId,
  updatedBy: actorId,
});

/**
 * Adds the update audit fields (server timestamp) to a partial update.
 * @param actorId uid of the acting principal, or `SYSTEM_ACTOR`.
 */
export const withUpdateAudit = <T extends object>(data: T, actorId: string): T & UpdateAuditFields => ({
  ...data,
  updatedAt: FieldValue.serverTimestamp(),
  updatedBy: actorId,
});
