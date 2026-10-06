import type { UnitTypeDefinition } from "@core/contracts";

/** Id of the neutral unit type every app has (decision 0030 A6). */
export const CORE_UNIT_TYPE_ID = "core.unit";

/**
 * Unit types the core registers for every app, before the modules' ones (decision 0030 A6):
 * one neutral `core.unit`, nestable, so an app without modules (and the local seed) can build
 * and move a unit tree. `core` is a reserved module id, so no module can redeclare it.
 */
export const CORE_UNIT_TYPES: readonly UnitTypeDefinition[] = [
  { id: CORE_UNIT_TYPE_ID, labelKey: "common.unitTypes.unit", allowedParents: ["project", CORE_UNIT_TYPE_ID] },
];
