// Public API of the unit entity (SP2 Task 11). Mutations (create, move, delete) live in features and
// invalidate `unitKeys.all(organizationId)`.
export { unitKeys } from "./api/unit-keys.ts";
export {
  fetchUnitTree,
  MAX_TREE_UNITS,
  type UnitPathSegment,
  unitQuery,
  unitsQuery,
  unitTreeQuery,
  unitTypesQuery,
  useUnitPath,
  useUnits,
  useUnitTree,
  useUnitTypes,
} from "./api/unit-queries.ts";
export { buildUnitTree, unitPathIn } from "./model/build-unit-tree.ts";
export { UnitBreadcrumb, type UnitBreadcrumbProps } from "./ui/UnitBreadcrumb.tsx";
