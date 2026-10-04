import type { ProjectId, TenantId, Unit, UnitId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { Page, PageRequest } from "../../../../shared/pagination/page.ts";
import type { TreeRewrite } from "../../../domain/unit-tree.ts";

/** `units` (SP1 spec §4); reads return live units only. */
export type UnitRepository = {
  readonly newId: () => UnitId;
  readonly get: (tx: Transaction | undefined, id: UnitId) => Promise<Unit | null>;
  /** Live units among `ids` (ancestor chains), in no order. */
  readonly getMany: (ids: readonly UnitId[]) => Promise<Unit[]>;
  /** Live children of the project root (`parentUnitId: null`) or of a unit, sorted by `(name, id)`. */
  readonly listChildren: (args: {
    projectId: ProjectId;
    parentUnitId: UnitId | null;
    page: PageRequest;
  }) => Promise<Page<Unit>>;
  /** Up to `limit` live units of a project, in no order (project deletes cascade in rounds). */
  readonly listOfProject: (args: { projectId: ProjectId; limit: number }) => Promise<Unit[]>;
  /** Up to `limit` live units whose `ancestorIds` contain `unitId`. */
  readonly listDescendants: (args: { tenantId: TenantId; unitId: UnitId; limit: number }) => Promise<Unit[]>;
  readonly create: (tx: Transaction, args: { unit: Unit; actorId: string }) => void;
  readonly update: (tx: Transaction, args: { unit: Unit; actorId: string }) => void;
  readonly softDelete: (tx: Transaction, args: { id: UnitId; deletedAt: string; actorId: string }) => void;
  /** Rewrites tree fields outside a transaction, in batches (subtree moves). */
  readonly rewriteTree: (args: {
    rewrites: readonly TreeRewrite[];
    updatedAt: string;
    actorId: string;
  }) => Promise<void>;
  /** Soft-deletes units outside a transaction, in batches (subtree deletes). */
  readonly softDeleteMany: (args: { ids: readonly UnitId[]; deletedAt: string; actorId: string }) => Promise<void>;
};
