import type { Unit, UnitId, UpdateUnitInput } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import { requirePermission } from "../../../access/application/grant-checks.ts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { InvalidUnitParentError } from "../../domain/errors/invalid-unit-parent-error.ts";
import { SubtreeTooLargeError } from "../../domain/errors/subtree-too-large-error.ts";
import { TenancyNotFoundError } from "../../domain/errors/tenancy-not-found-error.ts";
import type { UnitTreeBusyError } from "../../domain/errors/unit-tree-busy-error.ts";
import { MAX_SUBTREE_REWRITE, planMove, type TreeRewrite } from "../../domain/unit-tree.ts";
import type { TreeLock } from "../ports/driven/unit-tree-lock-store.ts";
import { changedKeys, recordTenancyAudit, unitNode, type TenancyCommand, type TenancyDeps } from "../tenancy-deps.ts";
import { acquireTreeLock, commitTreeChange, releaseTreeLock } from "../unit-tree-lock.ts";
import { loadAuthorizedUnit, loadTreeParent, type UnitError } from "./unit-access.ts";

export type UpdateUnitCommand = TenancyCommand & { readonly unitId: UnitId; readonly input: UpdateUnitInput };

export type UpdateUnitError = UnitError | InvalidUnitParentError | SubtreeTooLargeError | UnitTreeBusyError;

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

const auditUpdate = (tx: Transaction, deps: TenancyDeps, command: UpdateUnitCommand, next: Unit, moving: boolean) =>
  recordTenancyAudit(tx, deps, command, {
    tenantId: next.tenantId,
    action: moving ? "UNIT_MOVED" : "UNIT_UPDATED",
    target: { type: "unit", id: next.id },
    node: unitNode(next),
    changes: changedKeys(command.input),
  });

// Rename and overrides only: fields applied to the unit as read in the transaction, so a
// concurrent move's tree fields are never overwritten with stale ones.
const renameUnit = (deps: TenancyDeps, command: UpdateUnitCommand, now: string) =>
  deps.unitOfWork.run(async (tx): Promise<Result<Unit, UpdateUnitError>> => {
    const current = await deps.units.get(tx, command.unitId);
    if (current === null) return err(new TenancyNotFoundError("unit"));
    const next = applyFields(current, command.input, now);
    deps.units.update(tx, { unit: next, actorId: auditActorOf(command.actor).id });
    await auditUpdate(tx, deps, command, next, false);
    return ok(next);
  });

// Under the project's tree lock (decision 0030 §4): plan from the unit as read after the
// lock, rewrite descendants in batches, then commit the unit only if the lock is still ours.
// A throw keeps the lock; its lease expires and the next tree change finishes the move.
const moveUnit = async (deps: TenancyDeps, command: UpdateUnitCommand, lock: TreeLock, parentUnitId: UnitId | null, now: string): Promise<Result<Unit, UpdateUnitError>> => {
  const fresh = await deps.units.get(undefined, command.unitId);
  if (fresh === null) return err(new TenancyNotFoundError("unit"));
  const move = await planUnitMove(deps, command, fresh, parentUnitId);
  if (!move.ok) return move;
  const next = applyFields(move.data.placed, command.input, now);
  const actorId = auditActorOf(command.actor).id;
  if (move.data.descendants.length > 0) await deps.units.rewriteTree({ rewrites: move.data.descendants, updatedAt: now, actorId });
  const committed = await commitTreeChange(deps, {
    lock,
    expected: fresh,
    write: async (tx) => {
      deps.units.update(tx, { unit: next, actorId });
      await auditUpdate(tx, deps, command, next, true);
    },
  });
  return committed.ok ? ok(next) : committed;
};

/**
 * Renames, re-sets overrides or moves a unit inside its project (`core.unit.update` at the
 * unit and, for a move, at the new parent). Moves are serialized per project (409 CONFLICT
 * while another move or delete runs). Access projections hold node ids only, so a move
 * inside a project leaves them unchanged.
 */
export const makeUpdateUnit =
  (deps: TenancyDeps): UpdateUnit =>
  async (command) => {
    const loaded = await loadAuthorizedUnit(deps, { ...command, permission: "core.unit.update" });
    if (!loaded.ok) return loaded;
    const now = deps.clock.now().toISOString();
    const { parentUnitId } = command.input;
    if (parentUnitId === undefined) return renameUnit(deps, command, now);
    const scope = { tenantId: loaded.data.tenantId, projectId: loaded.data.projectId };
    const lock = await acquireTreeLock(deps, scope, { kind: "move", unitId: loaded.data.id, parentUnitId });
    if (!lock.ok) return lock;
    const moved = await moveUnit(deps, command, lock.data, parentUnitId, now);
    // An expected refusal before any rewrite frees the lock at once.
    if (!moved.ok && moved.error.code !== "CONFLICT") await releaseTreeLock(deps, lock.data);
    return moved;
  };
