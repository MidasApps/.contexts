import type { Unit } from "@core/contracts";
import type { TreeNode } from "#/shared/ui/organisms/TreeView/tree-model.ts";

type UnitLike = Pick<Unit, "id" | "name" | "parentUnitId">;

/**
 * Nests a flat unit list into TreeView nodes, siblings sorted by name in the viewer's locale.
 * Units whose parent is not visible become roots, so a partial view never hides a reachable unit.
 */
export const buildUnitTree = (units: readonly UnitLike[], locale: string): TreeNode[] => {
  const ids = new Set(units.map((unit) => unit.id));
  const byParent = new Map<string | null, UnitLike[]>();
  for (const unit of units) {
    const parent = unit.parentUnitId !== null && ids.has(unit.parentUnitId) ? unit.parentUnitId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), unit]);
  }
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const nest = (parent: string | null): TreeNode[] =>
    (byParent.get(parent) ?? [])
      .toSorted((a, b) => collator.compare(a.name, b.name))
      .map((unit) => {
        const children = nest(unit.id);
        return children.length === 0 ? { id: unit.id, label: unit.name } : { id: unit.id, label: unit.name, children };
      });
  return nest(null);
};

/** Ancestors of `unitId` (root first) followed by the unit, from a flat list; `[]` when absent. */
export const unitPathIn = <T extends UnitLike>(units: readonly T[], unitId: string | undefined): T[] => {
  const byId = new Map<string, T>(units.map((unit) => [unit.id, unit]));
  const path: T[] = [];
  let current = unitId === undefined ? undefined : byId.get(unitId);
  // The length guard stops a corrupt parent cycle; valid trees are at most 7 deep.
  while (current !== undefined && path.length <= units.length) {
    path.unshift(current);
    current = current.parentUnitId === null ? undefined : byId.get(current.parentUnitId);
  }
  return path;
};
