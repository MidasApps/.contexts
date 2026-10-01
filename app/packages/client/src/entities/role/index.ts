// Public API of the role entity (SP2 Tasks 11, 15): custom roles, the permission registry, role
// options and the pickers shared by the access settings features.
export { permissionsCatalogQuery, roleKeys, rolesQuery, usePermissionsCatalog, useRoles } from "./api/role-queries.ts";
export { groupPermissionsByModule, type PermissionModuleGroup, type PermissionResourceGroup } from "./model/group-permissions.ts";
export { DEVICE_SYSTEM_ROLES, PERSON_SYSTEM_ROLES, useRoleOptions, useRoleRefLabel, type RoleOption } from "./model/role-options.ts";
export { PermissionPicker, type PermissionPickerProps } from "./ui/PermissionPicker.tsx";
export { RoleChecklist, type RoleChecklistProps } from "./ui/RoleChecklist.tsx";
