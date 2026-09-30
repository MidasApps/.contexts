import type { Unit, UnitId, UnitTypeDefinition } from "@core/contracts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { paginateInMemory, type Page, type PageRequest } from "../../../shared/pagination/page.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { SubtreeTooLargeError } from "../../domain/errors/subtree-too-large-error.ts";
import { MAX_SUBTREE_REWRITE } from "../../domain/unit-tree.ts";
import { recordTenancyAudit, unitNode, type TenancyCommand, type TenancyDeps } from "../tenancy-deps.ts";
import { loadAuthorizedUnit, type UnitError } from "./unit-access.ts";

type UnitCommand = Omit<TenancyCommand, "requestId"> & { readonly unitId: UnitId };

/** Reads a unit (`core.unit.read` at the unit). */
export const makeGetUnit =
  (deps: Pick<TenancyDeps, "projects" | "units">) =>
  (command: UnitCommand): Promise<Result<Unit, UnitError>> =>
    loadAuthorizedUnit(deps, { ...command, permission: "core.unit.read" });

/**
 * Soft-deletes a unit and its subtree (`core.unit.delete`); more than 500 units answer
 * 422 SUBTREE_TOO_LARGE. Descendants go first in batches, then the unit with its audit
 * entry, so a failure leaves the unit reachable and a retry finishes the job.
 */
export const makeDeleteUnit =
  (deps: TenancyDeps) =>
  async (command: UnitCommand & TenancyCommand): Promise<Result<void, UnitError | SubtreeTooLargeError>> => {
    const loaded = await loadAuthorizedUnit(deps, { ...command, permission: "core.unit.delete" });
    if (!loaded.ok) return loaded;
    const unit = loaded.data;
    const descendants = await deps.units.listDescendants({ tenantId: unit.tenantId, unitId: unit.id, limit: MAX_SUBTREE_REWRITE });
    if (descendants.length + 1 > MAX_SUBTREE_REWRITE) return err(new SubtreeTooLargeError(MAX_SUBTREE_REWRITE));
    const now = deps.clock.now().toISOString();
    const actorId = auditActorOf(command.actor).id;
    if (descendants.length > 0) await deps.units.softDeleteMany({ ids: descendants.map((entry) => entry.id), deletedAt: now, actorId });
    await deps.unitOfWork.run(async (tx) => {
      deps.units.softDelete(tx, { id: unit.id, deletedAt: now, actorId });
      await recordTenancyAudit(tx, deps, command, { tenantId: unit.tenantId, action: "UNIT_DELETED", target: { type: "unit", id: unit.id }, node: unitNode(unit) });
    });
    return ok(undefined);
  };

/** Lists the unit types registered by the application modules, by id. */
export const makeListUnitTypes =
  (deps: Pick<TenancyDeps, "unitTypes">) =>
  (page: PageRequest): Page<UnitTypeDefinition> =>
    paginateInMemory({ items: deps.unitTypes.list(), page, positionOf: (type) => [type.id, type.id] });
