import type { AgentPermissionDefinition } from "../agents/agent-permissions.ts";
import type { Permission } from "../primitives/catalog-meta.schema.ts";

const MEMBERS = ["owner", "admin", "member"] as const;

const permission = (id: Permission, kind: AgentPermissionDefinition["kind"]): AgentPermissionDefinition => ({
  id,
  descriptionKey: `permissions.${id}`,
  kind,
  scope: "tenant",
  defaultRoles: MEMBERS,
});

/** Permissions added by SP4 (spec §4.1, §4.5): the chat and voice, member and above by default. */
export const CHAT_PERMISSIONS: readonly AgentPermissionDefinition[] = [
  permission("core.conversation.send", "write"),
  permission("core.conversation.read", "read"),
  permission("core.conversation.update", "write"),
  permission("core.conversation.delete", "write"),
  permission("core.voice.use", "read"),
];
