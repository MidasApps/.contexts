// Serializes unit moves and deletes per project (decision 0030 §4). A move or delete rewrites
// descendants in batches before its final transaction, so two of them must never interleave,
// and one that died half-way must be finished before the tree changes again.
import type { AuditLogEntry, ProjectId, TenantId, Unit } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import { err, ok, type Result } from "../../shared/result/result.ts";
import { TenancyNotFoundError } from "../domain/errors/tenancy-not-found-error.ts";
import { UnitTreeBusyError } from "../domain/errors/unit-tree-busy-error.ts";
import { MAX_SUBTREE_REWRITE, planMove } from "../domain/unit-tree.ts";
import type { TreeLock, TreeOperation } from "./ports/driven/unit-tree-lock-store.ts";
import { type TenancyDeps, unitNode } from "./tenancy-deps.ts";

/** A holder that dies keeps the tree for at most this long. */
export const TREE_LOCK_LEASE_MS = 120_000;

type Deps = Pick<TenancyDeps, "treeLocks" | "units" | "unitOfWork" | "clock" | "audit">;

type LockScope = { readonly tenantId: TenantId; readonly projectId: ProjectId };

const sameOperation = (left: TreeOperation, right: TreeOperation): boolean =>
  left.kind === right.kind &&
  left.unitId === right.unitId &&
  (left.kind !== "move" || (right.kind === "move" && left.parentUnitId === right.parentUnitId));

const isExpired = (lock: TreeLock, now: Date): boolean => Date.parse(lock.expiresAt) <= now.getTime();

const sameTree = (left: Unit, right: Unit): boolean =>
  left.parentUnitId === right.parentUnitId && left.ancestorIds.join("/") === right.ancestorIds.join("/");

type Attempt =
  | { readonly kind: "acquired"; readonly lock: TreeLock }
  | { readonly kind: "busy" }
  | { readonly kind: "abandoned"; readonly lock: TreeLock };

// A retry of the same operation takes the lock over (and heals what the first try left).
const tryAcquire = (deps: Deps, scope: LockScope, operation: TreeOperation): Promise<Attempt> =>
  deps.unitOfWork.run(async (tx): Promise<Attempt> => {
    const now = deps.clock.now();
    const current = await deps.treeLocks.get(tx, scope.projectId);
    if (current !== null && !sameOperation(current.operation, operation))
      return isExpired(current, now) ? { kind: "abandoned", lock: current } : { kind: "busy" };
    const lock: TreeLock = {
      ...scope,
      lockId: deps.treeLocks.newLockId(),
      operation,
      expiresAt: new Date(now.getTime() + TREE_LOCK_LEASE_MS).toISOString(),
    };
    deps.treeLocks.put(tx, lock);
    return { kind: "acquired", lock };
  });

/** Whether `lock` is still the project's lock; read it before the transaction's writes. */
const holdsTreeLock = async (tx: Transaction, deps: Pick<Deps, "treeLocks">, lock: TreeLock): Promise<boolean> =>
  (await deps.treeLocks.get(tx, lock.projectId))?.lockId === lock.lockId;

/** Frees the lock after an expected failure before any rewrite (only while it is ours). */
export const releaseTreeLock = (deps: Deps, lock: TreeLock): Promise<void> =>
  deps.unitOfWork.run(async (tx) => {
    if (await holdsTreeLock(tx, deps, lock)) deps.treeLocks.remove(tx, lock.projectId);
  });

/**
 * Final transaction of a move or delete: the lock must still be ours and the unit unchanged
 * since `expected` was read; then `write` runs and the lock is freed atomically with it.
 */
export const commitTreeChange = (
  deps: Deps,
  args: { lock: TreeLock; expected: Unit; write: (tx: Transaction) => Promise<void> },
) =>
  deps.unitOfWork.run(async (tx): Promise<Result<void, UnitTreeBusyError | TenancyNotFoundError>> => {
    const [held, current] = await Promise.all([
      holdsTreeLock(tx, deps, args.lock),
      deps.units.get(tx, args.expected.id),
    ]);
    if (!held) return err(new UnitTreeBusyError());
    if (current === null) return err(new TenancyNotFoundError("unit"));
    if (!sameTree(current, args.expected)) return err(new UnitTreeBusyError());
    await args.write(tx);
    deps.treeLocks.remove(tx, args.lock.projectId);
    return ok(undefined);
  });

const SYSTEM_ACTOR: AuditLogEntry["actor"] = { type: "system", id: "system" };

// A resumed delete finishes whatever subtree is left (the request checked the 500-unit limit).
const RESUME_DELETE_LIMIT = 10_000;

const auditResumed = (tx: Transaction, deps: Deps, lock: TreeLock, unit: Unit, action: "UNIT_MOVED" | "UNIT_DELETED") =>
  deps.audit.record(
    {
      log: "tenant",
      tenantId: unit.tenantId,
      action,
      actor: SYSTEM_ACTOR,
      target: { type: "unit", id: unit.id },
      node: unitNode(unit),
      outcome: "success",
      requestId: `tree-lock:${lock.lockId}`,
    },
    tx,
  );

// Finishes a move whose holder died: re-planning heals descendants (only changed ones are
// rewritten). A target deleted meanwhile heals in place: the subtree is rebased on the
// unit's current placement.
const finishMove = async (
  deps: Deps,
  lock: TreeLock,
  unit: Unit,
  parentUnitId: Unit["parentUnitId"],
): Promise<void> => {
  const target = parentUnitId === null ? null : await deps.units.get(undefined, parentUnitId);
  const newParent = target ?? (unit.parentUnitId === null ? null : await deps.units.get(undefined, unit.parentUnitId));
  const descendants = await deps.units.listDescendants({
    tenantId: unit.tenantId,
    unitId: unit.id,
    limit: MAX_SUBTREE_REWRITE,
  });
  const plan = planMove({ unit, newParent, descendants, maxSubtree: Number.POSITIVE_INFINITY });
  if (!plan.ok) return releaseTreeLock(deps, lock);
  const own = plan.rewrites.find((rewrite) => rewrite.id === unit.id);
  const now = deps.clock.now().toISOString();
  await deps.units.rewriteTree({
    rewrites: plan.rewrites.filter((rewrite) => rewrite.id !== unit.id),
    updatedAt: now,
    actorId: SYSTEM_ACTOR.id,
  });
  const placed: Unit =
    own === undefined
      ? unit
      : {
          ...unit,
          parentUnitId: own.parentUnitId,
          ancestorIds: [...own.ancestorIds],
          depth: own.depth,
          updatedAt: now,
        };
  await commitTreeChange(deps, {
    lock,
    expected: unit,
    write: async (tx) => {
      deps.units.update(tx, { unit: placed, actorId: SYSTEM_ACTOR.id });
      await auditResumed(tx, deps, lock, placed, "UNIT_MOVED");
    },
  });
};

const finishDelete = async (deps: Deps, lock: TreeLock, unit: Unit): Promise<void> => {
  const now = deps.clock.now().toISOString();
  const descendants = await deps.units.listDescendants({
    tenantId: unit.tenantId,
    unitId: unit.id,
    limit: RESUME_DELETE_LIMIT,
  });
  if (descendants.length > 0)
    await deps.units.softDeleteMany({
      ids: descendants.map((entry) => entry.id),
      deletedAt: now,
      actorId: SYSTEM_ACTOR.id,
    });
  await commitTreeChange(deps, {
    lock,
    expected: unit,
    write: async (tx) => {
      deps.units.softDelete(tx, { id: unit.id, deletedAt: now, actorId: SYSTEM_ACTOR.id });
      await auditResumed(tx, deps, lock, unit, "UNIT_DELETED");
    },
  });
};

/** Takes an abandoned lock over and finishes its operation as the system. */
const resumeAbandoned = async (deps: Deps, abandoned: TreeLock): Promise<void> => {
  const taken = await tryAcquire(deps, abandoned, abandoned.operation);
  if (taken.kind !== "acquired") return;
  const { lock } = taken;
  const unit = await deps.units.get(undefined, lock.operation.unitId);
  if (unit === null) return releaseTreeLock(deps, lock);
  return lock.operation.kind === "delete"
    ? finishDelete(deps, lock, unit)
    : finishMove(deps, lock, unit, lock.operation.parentUnitId);
};

const ATTEMPTS = 3;

/**
 * Acquires the project's tree lock for `operation`, finishing an abandoned change first.
 * @returns 409 CONFLICT while another live change holds it.
 */
export const acquireTreeLock = async (
  deps: Deps,
  scope: LockScope,
  operation: TreeOperation,
): Promise<Result<TreeLock, UnitTreeBusyError>> => {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const result = await tryAcquire(deps, scope, operation);
    if (result.kind === "acquired") return ok(result.lock);
    if (result.kind === "busy") return err(new UnitTreeBusyError());
    await resumeAbandoned(deps, result.lock);
  }
  return err(new UnitTreeBusyError());
};

/**
 * For unit creation: no tree change may be in progress in the project (a new unit would copy
 * a parent's stale path); an abandoned one is finished first.
 */
export const ensureTreeIdle = async (deps: Deps, scope: LockScope): Promise<Result<void, UnitTreeBusyError>> => {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const current = await deps.unitOfWork.run((tx) => deps.treeLocks.get(tx, scope.projectId));
    if (current === null) return ok(undefined);
    if (!isExpired(current, deps.clock.now())) return err(new UnitTreeBusyError());
    await resumeAbandoned(deps, current);
  }
  return err(new UnitTreeBusyError());
};

/** Inside the create transaction: still no lock (read before the writes). */
export const isTreeIdle = async (
  tx: Transaction,
  deps: Pick<Deps, "treeLocks">,
  projectId: ProjectId,
): Promise<boolean> => (await deps.treeLocks.get(tx, projectId)) === null;
