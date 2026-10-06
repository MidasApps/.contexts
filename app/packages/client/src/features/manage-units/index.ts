// Public API of the manage-units feature (SP2 Task 16): the unit tree editor of a project.
export {
  descendantIds,
  type MoveTarget,
  moveTargets,
  PROJECT_ROOT,
  typesAllowedUnder,
} from "./model/unit-tree-rules.ts";
export { UnitTreeEditor, type UnitTreeEditorProps } from "./ui/UnitTreeEditor.tsx";
