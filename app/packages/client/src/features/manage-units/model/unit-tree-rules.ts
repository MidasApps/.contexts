import type { Unit, UnitTypeDefinition } from "@core/contracts";

/** Unit types that may be created under `parent` (their `allowedParents` include its kind). */
export const typesAllowedUnder = (types: readonly UnitTypeDefinition[], parentKind: string): UnitTypeDefinition[] =>
  types.filter((type) => type.allowedParents.includes(parentKind));

/** Ids of every unit below `unitId` (from the flat tree), for "move" exclusions and delete warnings. */
export const descendantIds = (units: readonly { id: string; ancestorIds: readonly string[] }[], unitId: string): Set<string> =>
  new Set(units.filter((unit) => unit.ancestorIds.includes(unitId)).map((unit) => unit.id));

export type MoveTarget = { readonly value: string; readonly parentUnitId: string | null; readonly label: string };

/** Value of the "directly under the project" target in selects. */
export const PROJECT_ROOT = "__project__";

/**
 * Valid destinations for moving `unit` (SP1 spec §6.1): the project root or any unit that is not
 * the unit itself, one of its descendants or its current parent, and whose type the unit's type
 * accepts as parent. Labels are the destination paths (`Site A › Floor 2`).
 */
export const moveTargets = (args: {
  unit: Unit;
  units: readonly Unit[];
  types: readonly UnitTypeDefinition[];
  projectLabel: string;
  pathOf: (unit: Unit) => string;
}): MoveTarget[] => {
  const { unit, units, types } = args;
  const allowed = types.find((type) => type.id === unit.type)?.allowedParents ?? [];
  const excluded = descendantIds(units, unit.id).add(unit.id);
  const root: MoveTarget[] = allowed.includes("project") && unit.parentUnitId !== null ? [{ value: PROJECT_ROOT, parentUnitId: null, label: args.projectLabel }] : [];
  const underUnits = units
    .filter((candidate) => !excluded.has(candidate.id) && candidate.id !== unit.parentUnitId && allowed.includes(candidate.type))
    .map((candidate) => ({ value: candidate.id, parentUnitId: candidate.id, label: args.pathOf(candidate) }));
  return [...root, ...underUnits];
};
