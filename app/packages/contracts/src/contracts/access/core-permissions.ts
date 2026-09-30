import { AGENT_PERMISSIONS } from "../agents/agent-permissions.ts";
import type { Permission } from "../primitives/catalog-meta.schema.ts";
import type { PlatformRole } from "../identity/platform-staff.schema.ts";
import type { PermissionDefinition, PermissionKind } from "./permission-definition.schema.ts";
import type { SystemRoleKey } from "./system-roles.ts";

const tenant = (id: Permission, kind: PermissionKind, defaultRoles: readonly SystemRoleKey[]): PermissionDefinition => ({
  id,
  descriptionKey: `permissions.${id}`,
  kind,
  scope: "tenant",
  defaultRoles: [...defaultRoles],
});

const platform = (id: Permission, kind: PermissionKind, defaultRoles: readonly PlatformRole[]): PermissionDefinition => ({
  id,
  descriptionKey: `permissions.${id}`,
  kind,
  scope: "platform",
  defaultRoles: [...defaultRoles],
});

const EVERYONE = ["owner", "admin", "member", "viewer"] as const;
const MEMBERS = ["owner", "admin", "member"] as const;
const ADMINS = ["owner", "admin"] as const;
const STAFF = ["platform-admin", "platform-support"] as const;

/** The permissions of SP1 spec §5.1 (identity, tenancy, access, audit, platform). */
export const SP1_PERMISSIONS: readonly PermissionDefinition[] = [
  // The device role reads its own context (`GET /v1/me/context`) and nothing else (decision 0030 A1).
  tenant("core.organization.read", "read", [...EVERYONE, "device"]),
  tenant("core.organization.update", "write", ADMINS),
  tenant("core.organization.delete", "write", ["owner"]),
  tenant("core.project.read", "read", EVERYONE),
  tenant("core.project.create", "write", ADMINS),
  tenant("core.project.update", "write", ADMINS),
  tenant("core.project.delete", "write", ADMINS),
  tenant("core.unit.read", "read", EVERYONE),
  tenant("core.unit.create", "write", ADMINS),
  tenant("core.unit.update", "write", ADMINS),
  tenant("core.unit.delete", "write", ADMINS),
  tenant("core.member.read", "read", MEMBERS),
  tenant("core.member.invite", "write", ADMINS),
  tenant("core.member.update", "write", ADMINS),
  tenant("core.member.remove", "write", ADMINS),
  tenant("core.role.read", "read", MEMBERS),
  tenant("core.role.create", "write", ADMINS),
  tenant("core.role.update", "write", ADMINS),
  tenant("core.role.delete", "write", ADMINS),
  tenant("core.api-key.read", "read", ADMINS),
  tenant("core.api-key.create", "write", ADMINS),
  tenant("core.api-key.revoke", "write", ADMINS),
  tenant("core.device.read", "read", ADMINS),
  tenant("core.device.create", "write", ADMINS),
  tenant("core.device.revoke", "write", ADMINS),
  tenant("core.audit-log.read", "read", ADMINS),
  tenant("core.approval.read", "read", MEMBERS),
  tenant("core.approval.decide", "write", ADMINS),
  platform("platform.organization.read", "read", STAFF),
  platform("platform.user.read", "read", STAFF),
  platform("platform.audit-log.read", "read", STAFF),
  platform("platform.user.impersonate", "write", STAFF),
  platform("platform.staff.manage", "write", ["platform-admin"]),
];

/**
 * The core permission catalog: SP1 spec §5.1 plus the permissions of the agent
 * runtime (SP3 spec §2.2, `AGENT_PERMISSIONS`). Modules add theirs through the access
 * registry (`createAccessCore({ permissions })`), which rejects duplicates.
 */
export const CORE_PERMISSIONS: readonly PermissionDefinition[] = [
  ...SP1_PERMISSIONS,
  ...AGENT_PERMISSIONS.map((permission): PermissionDefinition => ({ ...permission, defaultRoles: [...permission.defaultRoles] })),
];
