import type { Unit, UnitId, UnitTypeDefinition } from "@core/contracts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { paginateInMemory, type Page, type PageRequest } from "../../../shared/pagination/page.ts";
import { err, type Result } from "../../../shared/result/result.ts";
import { SubtreeTooLargeError } from "../../domain/errors/subtree-too-large-error.ts";
import type { UnitTreeBusyError } from "../../domain/errors/unit-tree-busy-error.ts";
import { MAX_SUBTREE_REWRITE } from "../../domain/unit-tree.ts";
import { recordTenancyAudit, unitNode, type TenancyCommand, type TenancyDeps } from "../tenancy-deps.ts";
import { acquireTreeLock, commitTreeChange, releaseTreeLock } from "../unit-tree-lock.ts";
import { loadAuthorizedUnit, type UnitError } from "./unit-access.ts";
import { TenancyNotFoundError } from "../../domain/errors/tenancy-not-found-error.ts";

type UnitCommand = Omit<TenancyCommand, "requestId"> & { readonly unitId: UnitId };

/** Reads a unit (`core.unit.read` at the unit). */
export const makeGetUnit =
  (deps: Pick<TenancyDeps, "projects" | "units">) =>
  (command: UnitCommand): Promise<Result<Unit, UnitError>> =>
    loadAuthorizedUnit(deps, { ...command, permission: "core.unit.read" });

/**
 * Soft-deletes a unit and its subtree (`core.unit.delete`); more than 500 units answer
 * 422 SUBTREE_TOO_LARGE. Runs under the project's tree lock (409 CONFLICT while a move or
 * delete runs, decision 0030 §4): descendants go first in batches, then the unit with its
 * audit entry, so a failure leaves the unit reachable and a retry (or the next tree change,
 * once the lease expired) finishes the job.
 */
export const makeDeleteUnit =
  (deps: TenancyDeps) =>
  async (command: UnitCommand & TenancyCommand): Promise<Result<void, UnitError | SubtreeTooLargeError | UnitTreeBusyError>> => {
    const loaded = await loadAuthorizedUnit(deps, { ...command, permission: "core.unit.delete" });
    if (!loaded.ok) return loaded;
    const lock = await acquireTreeLock(deps, { tenantId: loaded.data.tenantId, projectId: loaded.data.projectId }, { kind: "delete", unitId: loaded.data.id });
    if (!lock.ok) return lock;
    const unit = await deps.units.get(undefined, loaded.data.id);
    if (unit === null) {
      await releaseTreeLock(deps, lock.data);
      return err(new TenancyNotFoundError("unit"));
    }
    const descendants = await deps.units.listDescendants({ tenantId: unit.tenantId, unitId: unit.id, limit: MAX_SUBTREE_REWRITE });
    if (descendants.length + 1 > MAX_SUBTREE_REWRITE) {
      await releaseTreeLock(deps, lock.data);
      return err(new SubtreeTooLargeError(MAX_SUBTREE_REWRITE));
    }
    const now = deps.clock.now().toISOString();
    const actorId = auditActorOf(command.actor).id;
    if (descendants.length > 0) await deps.units.softDeleteMany({ ids: descendants.map((entry) => entry.id), deletedAt: now, actorId });
    return commitTreeChange(deps, {
      lock: lock.data,
      expected: unit,
      write: async (tx) => {
        deps.units.softDelete(tx, { id: unit.id, deletedAt: now, actorId });
        await recordTenancyAudit(tx, deps, command, { tenantId: unit.tenantId, action: "UNIT_DELETED", target: { type: "unit", id: unit.id }, node: unitNode(unit) });
      },
    });
  };

/** Lists the unit types registered by the application modules, by id. */
export const makeListUnitTypes =
  (deps: Pick<TenancyDeps, "unitTypes">) =>
  (page: PageRequest): Page<UnitTypeDefinition> =>
    paginateInMemory({ items: deps.unitTypes.list(), page, positionOf: (type) => [type.id, type.id] });
