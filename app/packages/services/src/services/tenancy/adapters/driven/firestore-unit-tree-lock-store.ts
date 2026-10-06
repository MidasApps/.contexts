import { IsoDateTimeSchema, ProjectIdSchema, TenantIdSchema, UnitIdSchema } from "@core/contracts";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "#/services/shared/firestore/collections.ts";
import { createContractConverter } from "#/services/shared/firestore/contract-converter.ts";
import type { TreeLock, UnitTreeLockStore } from "../../application/ports/driven/unit-tree-lock-store.ts";

const StoredTreeLockSchema = z.object({
  tenantId: TenantIdSchema,
  projectId: ProjectIdSchema,
  lockId: z.string().min(1),
  operation: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("move"), unitId: UnitIdSchema, parentUnitId: UnitIdSchema.nullable() }),
    z.object({ kind: z.literal("delete"), unitId: UnitIdSchema }),
  ]),
  expiresAt: IsoDateTimeSchema,
});

const converter = createContractConverter({ schema: StoredTreeLockSchema });

/**
 * Firestore `UnitTreeLockStore` over `unit-tree-locks/{projectId}` (decision 0030 §4).
 * Server-only: Security Rules deny every client read and write of it.
 */
export const createFirestoreUnitTreeLockStore = (deps: { firestore: Firestore }): UnitTreeLockStore => {
  const raw = () => deps.firestore.collection(CORE_COLLECTIONS.unitTreeLocks);
  return {
    newLockId: () => raw().doc().id,
    get: async (tx, projectId) =>
      ((await tx.get(raw().withConverter(converter).doc(projectId))).data() as TreeLock | undefined) ?? null,
    put: (tx, lock) =>
      void tx.set(raw().doc(lock.projectId), { ...converter.toFirestore(lock), schemaVersion: CORE_SCHEMA_VERSION }),
    remove: (tx, projectId) => void tx.delete(raw().doc(projectId)),
  };
};
