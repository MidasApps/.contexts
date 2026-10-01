// Public API of the edit-role feature (SP2 Task 15): create, edit and delete custom roles.
export { changedRole, draftOf, validateRoleDraft, type RoleDraft } from "./model/role-draft.ts";
export { DeleteRoleDialog, type DeleteRoleDialogProps } from "./ui/DeleteRoleDialog.tsx";
export { RoleEditorDialog, type RoleEditorDialogProps } from "./ui/RoleEditorDialog.tsx";
