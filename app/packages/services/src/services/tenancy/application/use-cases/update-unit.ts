import type { Unit, UnitId, UpdateUnitInput } from "@core/contracts";
import { requirePermission } from "../../../access/application/grant-checks.ts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { InvalidUnitParentError } from "../../domain/errors/invalid-unit-parent-error.ts";
import { SubtreeTooLargeError } from "../../domain/errors/subtree-too-large-error.ts";
import { MAX_SUBTREE_REWRITE, planMove, type TreeRewrite } from "../../domain/unit-tree.ts";
import { changedKeys, recordTenancyAudit, unitNode, type TenancyCommand, type TenancyDeps } from "../tenancy-deps.ts";
import { loadAuthorizedUnit, loadTreeParent, type UnitError } from "./unit-access.ts";

export type UpdateUnitCommand = TenancyCommand & { readonly unitId: UnitId; readonly input: UpdateUnitInput };

export type UpdateUnitError = UnitError | InvalidUnitParentError | SubtreeTooLargeError;

export type UpdateUnit = (command: UpdateUnitCommand) => Promise<Result<Unit, UpdateUnitError>>;

const applyFields = (unit: Unit, input: UpdateUnitInput, now: string): Unit => {
  const settings = { ...unit.settings };
  for (const key of ["timeZone", "currency"] as const) {
    const value = input.settings?.[key];
    if (value === null) delete settings[key];
    else if (value !== undefined) Object.assign(settings, { [key]: value });
  }
  return { ...unit, ...(input.name === undefined ? {} : { name: input.name }), settings, updatedAt: now };
};

type Move = { readonly placed: Unit; readonly descendants: readonly TreeRewrite[] };

// Checks the destination and plans the subtree rewrite (SP1 spec §6.1).
const planUnitMove = async (deps: TenancyDeps, command: UpdateUnitCommand, unit: Unit, parentUnitId: UnitId | null): Promise<Result<Move, UpdateUnitError>> => {
  const parent = await loadTreeParent(deps, { projectId: unit.projectId, parentUnitId });
  if (!parent.ok) return err(new InvalidUnitParentError("PARENT_NOT_FOUND"));
  const allowed = await requirePermission({ ...command, permission: "core.unit.update", node: parent.data.node });
  if (!allowed.ok) return allowed;
  if (!deps.unitTypes.allowsParent({ type: unit.type, parent: parent.data.unit?.type ?? "project" })) return err(new InvalidUnitParentError("TYPE_NOT_ALLOWED"));
  const descendants = await deps.units.listDescendants({ tenantId: unit.tenantId, unitId: unit.id, limit: MAX_SUBTREE_REWRITE });
  const plan = planMove({ unit, newParent: parent.data.unit, descendants });
  if (!plan.ok) return err(plan.reason === "TOO_LARGE" ? new SubtreeTooLargeError(MAX_SUBTREE_REWRITE) : new InvalidUnitParentError(plan.reason));
  const own = plan.rewrites.find((rewrite) => rewrite.id === unit.id);
  const placed = own === undefined ? unit : { ...unit, parentUnitId: own.parentUnitId, ancestorIds: [...own.ancestorIds], depth: own.depth };
  return ok({ placed, descendants: plan.rewrites.filter((rewrite) => rewrite.id !== unit.id) });
};

/**
 * Renames, re-sets overrides or moves a unit inside its project (`core.unit.update` at
 * the unit and, for a move, at the new parent). A move rewrites the descendants in
 * batches first, then the unit with its audit entry; a retry heals an interrupted move.
 * Access projections hold node ids only, so a move inside a project leaves them unchanged.
 */
export const makeUpdateUnit =
  (deps: TenancyDeps): UpdateUnit =>
  async (command) => {
    const loaded = await loadAuthorizedUnit(deps, { ...command, permission: "core.unit.update" });
    if (!loaded.ok) return loaded;
    const now = deps.clock.now().toISOString();
    const { parentUnitId } = command.input;
    const moving = parentUnitId !== undefined;
    const move = moving ? await planUnitMove(deps, command, loaded.data, parentUnitId) : ok<Move>({ placed: loaded.data, descendants: [] });
    if (!move.ok) return move;
    const next = applyFields(move.data.placed, command.input, now);
    const actorId = auditActorOf(command.actor).id;
    if (move.data.descendants.length > 0) await deps.units.rewriteTree({ rewrites: move.data.descendants, updatedAt: now, actorId });
    await deps.unitOfWork.run(async (tx) => {
      deps.units.update(tx, { unit: next, actorId });
      await recordTenancyAudit(tx, deps, command, {
        tenantId: next.tenantId,
        action: moving ? "UNIT_MOVED" : "UNIT_UPDATED",
        target: { type: "unit", id: next.id },
        node: unitNode(next),
        changes: changedKeys(command.input),
      });
    });
    return ok(next);
  };
