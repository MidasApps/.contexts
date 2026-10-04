// Public API of the permission entity (SP2 Tasks 11, 19): `can()` at a node from the access context,
// and platform permissions of the staff role (`/admin`).
export { type PermissionsState, useCan, usePermissions } from "./model/use-can.ts";
export { grantCoversNode, myGrantsQuery, useMyGrants } from "./model/use-my-grants.ts";
export { platformRoleCan, usePlatformPermissions } from "./model/use-platform-permissions.ts";
export { Can, type CanProps } from "./ui/Can.tsx";
