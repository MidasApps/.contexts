import type { CreateUnitInput, ProjectId, Unit } from "@core/contracts";
import { requirePermission } from "#/services/access/application/grant-checks.ts";
import { auditActorOf } from "#/services/audit/domain/audit-actor.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import { InvalidUnitParentError } from "../../domain/errors/invalid-unit-parent-error.ts";
import { UnitTreeBusyError } from "../../domain/errors/unit-tree-busy-error.ts";
import { placementUnder } from "../../domain/unit-tree.ts";
import { recordTenancyAudit, type TenancyCommand, type TenancyDeps, unitNode } from "../tenancy-deps.ts";
import { ensureTreeIdle, isTreeIdle } from "../unit-tree-lock.ts";
import { loadTreeParent, type UnitError } from "./unit-access.ts";

export type CreateUnitCommand = TenancyCommand & { readonly projectId: ProjectId; readonly input: CreateUnitInput };

export type CreateUnit = (
  command: CreateUnitCommand,
) => Promise<Result<Unit, UnitError | InvalidUnitParentError | UnitTreeBusyError>>;

/**
 * Creates a unit under the project root or a unit of the same project
 * (`core.unit.create` at the parent): the type must be registered and allow the
 * parent, and the tree stays within `MAX_UNIT_DEPTH` (422 INVALID_UNIT_PARENT). Refused
 * with 409 CONFLICT while a move or delete rewrites the project's tree (decision 0030 §4):
 * the new unit would copy a stale parent path.
 */
export const makeCreateUnit =
  (deps: TenancyDeps): CreateUnit =>
  async (command) => {
    const parent = await loadTreeParent(deps, {
      projectId: command.projectId,
      parentUnitId: command.input.parentUnitId,
    });
    if (!parent.ok) return parent;
    const allowed = await requirePermission({ ...command, permission: "core.unit.create", node: parent.data.node });
    if (!allowed.ok) return allowed;
    const { type, name, settings } = command.input;
    if (deps.unitTypes.get(type) === undefined) return err(new InvalidUnitParentError("UNKNOWN_TYPE"));
    if (!deps.unitTypes.allowsParent({ type, parent: parent.data.unit?.type ?? "project" }))
      return err(new InvalidUnitParentError("TYPE_NOT_ALLOWED"));
    const placement = placementUnder(parent.data.unit);
    if (placement === null) return err(new InvalidUnitParentError("TOO_DEEP"));
    const idle = await ensureTreeIdle(deps, {
      tenantId: parent.data.project.tenantId,
      projectId: parent.data.project.id,
    });
    if (!idle.ok) return idle;
    const now = deps.clock.now().toISOString();
    const { project } = parent.data;
    const unit: Unit = {
      id: deps.units.newId(),
      tenantId: project.tenantId,
      projectId: project.id,
      ...placement,
      ancestorIds: [...placement.ancestorIds],
      type,
      name,
      settings: { ...settings },
      createdAt: now,
      updatedAt: now,
    };
    return deps.unitOfWork.run(async (tx): Promise<Result<Unit, UnitTreeBusyError>> => {
      // The lock read conflicts with a move that starts meanwhile, so one of the two retries.
      if (!(await isTreeIdle(tx, deps, project.id))) return err(new UnitTreeBusyError());
      deps.units.create(tx, { unit, actorId: auditActorOf(command.actor).id });
      await recordTenancyAudit(tx, deps, command, {
        tenantId: unit.tenantId,
        action: "UNIT_CREATED",
        target: { type: "unit", id: unit.id },
        node: unitNode(unit),
      });
      return ok(unit);
    });
  };
