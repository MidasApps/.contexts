import { MAX_UNIT_DEPTH, type UnitId } from "@core/contracts";

/** The tree fields of a unit (SP1 spec §4): ancestors root first, depth = ancestor count. */
export type TreeUnit = {
  readonly id: UnitId;
  readonly parentUnitId: UnitId | null;
  readonly ancestorIds: readonly UnitId[];
  readonly depth: number;
};

export type TreePlacement = Omit<TreeUnit, "id">;

/** A move may rewrite at most this many units, the moved one included (SP1 spec §6.1). */
export const MAX_SUBTREE_REWRITE = 500;

/**
 * Tree fields of a new unit under `parent` (null = directly under the project).
 * @returns null when the unit would exceed `MAX_UNIT_DEPTH`.
 */
export const placementUnder = (parent: TreeUnit | null): TreePlacement | null => {
  if (parent === null) return { parentUnitId: null, ancestorIds: [], depth: 0 };
  if (parent.depth + 1 > MAX_UNIT_DEPTH) return null;
  return { parentUnitId: parent.id, ancestorIds: [...parent.ancestorIds, parent.id], depth: parent.depth + 1 };
};

export type MoveFailure = "CYCLE" | "TOO_DEEP" | "TOO_LARGE";

export type TreeRewrite = TreeUnit;

export type MovePlan =
  | { readonly ok: true; readonly rewrites: readonly TreeRewrite[] }
  | { readonly ok: false; readonly reason: MoveFailure };

const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

// The path below the moved unit is kept; everything above it is replaced by the new base.
const rebase = (descendant: TreeUnit, unitId: UnitId, base: readonly UnitId[]): TreeUnit | null => {
  const at = descendant.ancestorIds.indexOf(unitId);
  if (at === -1) return null;
  const ancestorIds = [...base, ...descendant.ancestorIds.slice(at)];
  return { id: descendant.id, parentUnitId: ancestorIds.at(-1) ?? null, ancestorIds, depth: ancestorIds.length };
};

/**
 * Plans moving `unit` (and its subtree) under `newParent` inside the same project. Pure;
 * `descendants` are every unit whose `ancestorIds` contain the unit. Only units whose tree
 * fields change are rewritten, so re-running an interrupted move heals stale descendants.
 */
export const planMove = (args: {
  unit: TreeUnit;
  newParent: TreeUnit | null;
  descendants: readonly TreeUnit[];
  maxSubtree?: number;
}): MovePlan => {
  const { unit, newParent } = args;
  if (newParent !== null && (newParent.id === unit.id || newParent.ancestorIds.includes(unit.id)))
    return { ok: false, reason: "CYCLE" };
  if (args.descendants.length + 1 > (args.maxSubtree ?? MAX_SUBTREE_REWRITE)) return { ok: false, reason: "TOO_LARGE" };
  const base = newParent === null ? [] : [...newParent.ancestorIds, newParent.id];
  const moved: TreeUnit = { id: unit.id, parentUnitId: newParent?.id ?? null, ancestorIds: base, depth: base.length };
  const rebased = args.descendants.flatMap((descendant) => rebase(descendant, unit.id, base) ?? []);
  const all = [moved, ...rebased];
  if (all.some((entry) => entry.depth > MAX_UNIT_DEPTH)) return { ok: false, reason: "TOO_DEEP" };
  const current = new Map([unit, ...args.descendants].map((entry) => [entry.id, entry] as const));
  const rewrites = all.filter((entry) => {
    const before = current.get(entry.id);
    return (
      before === undefined ||
      before.parentUnitId !== entry.parentUnitId ||
      !sameIds(before.ancestorIds, entry.ancestorIds)
    );
  });
  return { ok: true, rewrites };
};
