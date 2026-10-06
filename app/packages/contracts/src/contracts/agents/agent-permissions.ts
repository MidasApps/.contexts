import type { Permission } from "../primitives/catalog-meta.schema.ts";

/**
 * Same shape as SP1's `PermissionDefinition` (SP1 spec §5.1). SP1's
 * `access/core-permissions.ts` was not committed when SP3 Task 4 ran, so the SP3
 * permissions live here and `CORE_PERMISSIONS` must spread `AGENT_PERMISSIONS`
 * (tracked as an SP3 report concern; one line in SP1's file once it exists).
 */
export type AgentPermissionDefinition = {
  readonly id: Permission;
  readonly descriptionKey: string;
  readonly kind: "read" | "write";
  readonly scope: "tenant";
  readonly requiresApproval?: boolean;
  readonly defaultRoles: readonly ("owner" | "admin" | "member")[];
};

const MEMBERS = ["owner", "admin", "member"] as const;
const ADMINS = ["owner", "admin"] as const;

const permission = (
  id: Permission,
  kind: AgentPermissionDefinition["kind"],
  defaultRoles: AgentPermissionDefinition["defaultRoles"],
): AgentPermissionDefinition => ({ id, descriptionKey: `permissions.${id}`, kind, scope: "tenant", defaultRoles });

/** Permissions added by SP3 (spec §2.2). `owner` and `admin` also get them through SP1's system role rules. */
export const AGENT_PERMISSIONS: readonly AgentPermissionDefinition[] = [
  permission("core.chat.use", "read", MEMBERS),
  permission("core.mcp.use", "read", ADMINS),
  permission("core.web-tools.use", "read", MEMBERS),
  permission("core.knowledge.read", "read", MEMBERS),
  permission("core.knowledge.write", "write", ADMINS),
  permission("core.knowledge.delete", "write", ADMINS),
  permission("core.catalog.read", "read", MEMBERS),
  permission("core.catalog.query", "read", MEMBERS),
  permission("core.connector.read", "read", ADMINS),
  permission("core.connector.write", "write", ADMINS),
  permission("core.agent-settings.read", "read", ADMINS),
  permission("core.agent-settings.update", "write", ADMINS),
  permission("core.usage.read", "read", ADMINS),
  permission("core.file.upload", "write", MEMBERS),
];
