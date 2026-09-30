import type { ProjectId, TenantId, UnitId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";

/** A tree change that rewrites units outside one transaction (SP1 spec §6.1). */
export type TreeOperation =
  | { readonly kind: "move"; readonly unitId: UnitId; readonly parentUnitId: UnitId | null }
  | { readonly kind: "delete"; readonly unitId: UnitId };

/**
 * The one tree change in progress in a project (decision 0030 §4). The operation is stored
 * so that another change can finish it when its holder died (lease expired).
 */
export type TreeLock = {
  readonly tenantId: TenantId;
  readonly projectId: ProjectId;
  readonly lockId: string;
  readonly operation: TreeOperation;
  /** ISO 8601 UTC: after it, the next tree change resumes this operation first. */
  readonly expiresAt: string;
};

/** `unit-tree-locks/{projectId}`: reads and writes inside the callers' transactions. */
export type UnitTreeLockStore = {
  readonly newLockId: () => string;
  readonly get: (tx: Transaction, projectId: ProjectId) => Promise<TreeLock | null>;
  readonly put: (tx: Transaction, lock: TreeLock) => void;
  readonly remove: (tx: Transaction, projectId: ProjectId) => void;
};
