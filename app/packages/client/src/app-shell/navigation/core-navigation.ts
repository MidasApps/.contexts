import type { Permission } from "@core/contracts";
import {
  PROFILE_SECTIONS,
  type ProfileSection,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "#/shared/lib/router/route-paths.ts";
import type { NavGroup } from "#/shared/lib/shell/shell-types.ts";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";
import type { ShellNavItem } from "./navigation-registry.ts";

// Read permission of each settings section (SP1 spec §7.3; SP3 spec §2.2 and SP5 spec §2.1 for the
// runtime ones) and the heading it sits under (decision 0055).
const SETTINGS: Record<SettingsSection, { icon: IconName; permission: Permission; group: NavGroup }> = {
  general: { icon: "settings", permission: "core.organization.read", group: "organization" },
  members: { icon: "users", permission: "core.member.read", group: "organization" },
  invitations: { icon: "user-plus", permission: "core.member.invite", group: "organization" },
  roles: { icon: "shield", permission: "core.role.read", group: "organization" },
  units: { icon: "network", permission: "core.unit.read", group: "organization" },
  "api-keys": { icon: "key", permission: "core.api-key.read", group: "access" },
  devices: { icon: "smartphone", permission: "core.device.read", group: "access" },
  agents: { icon: "bot", permission: "core.agent-settings.read", group: "ai" },
  skills: { icon: "sparkles", permission: "core.agent-settings.read", group: "ai" },
  knowledge: { icon: "file-text", permission: "core.knowledge.read", group: "ai" },
  connectors: { icon: "plug", permission: "core.connector.read", group: "ai" },
  workflows: { icon: "workflow", permission: "core.workflow-run.read", group: "operations" },
  approvals: { icon: "inbox", permission: "core.approval.read", group: "operations" },
  usage: { icon: "chart", permission: "core.usage.read", group: "operations" },
  traces: { icon: "scroll-text", permission: "core.trace.read", group: "operations" },
  evals: { icon: "activity", permission: "core.eval.read", group: "operations" },
  flags: { icon: "flag", permission: "core.flag.read", group: "operations" },
};

const PROFILE_ICONS: Record<ProfileSection, IconName> = {
  account: "user",
  preferences: "languages",
  security: "shield-check",
  sessions: "monitor",
  notifications: "bell",
};

// `/admin` areas (SP5 spec §6), each gated by the platform permission its API authorizes. The
// server guards `/admin` (staff + MFA); `platform-support` holds the read permissions only, so it
// sees organizations, users, connectors, traces, logs and costs.
// Grouped by what staff come to do (decision 0055): customers, AI, operations.
const ADMIN: { name: string; icon: IconName; permission: Permission; group: NavGroup }[] = [
  { name: "organizations", icon: "building", permission: "platform.organization.read", group: "customers" },
  { name: "plans", icon: "credit-card", permission: "platform.plan.manage", group: "customers" },
  { name: "users", icon: "users", permission: "platform.user.read", group: "customers" },
  { name: "agents", icon: "bot", permission: "platform.agent.manage", group: "ai" },
  { name: "models", icon: "cpu", permission: "platform.model.manage", group: "ai" },
  { name: "evals", icon: "activity", permission: "platform.eval.manage", group: "ai" },
  { name: "traces", icon: "scroll-text", permission: "platform.trace.read", group: "ai" },
  { name: "logs", icon: "list", permission: "platform.trace.read", group: "ai" },
  { name: "costs", icon: "wallet", permission: "platform.usage.read", group: "ai" },
  { name: "workflows", icon: "workflow", permission: "platform.workflow.manage", group: "operations" },
  { name: "flags", icon: "flag", permission: "platform.flag.manage", group: "operations" },
  { name: "connectors", icon: "plug", permission: "platform.connector.read", group: "operations" },
];

const HOMES: ShellNavItem[] = [
  {
    id: "core.organization.home",
    slot: "organization",
    labelKey: "shell.nav.organizationHome",
    icon: "home",
    permission: "core.organization.read",
    order: 0,
    target: { kind: "organization-home" },
  },
  {
    id: "core.organization.settings",
    slot: "organization",
    labelKey: "shell.nav.organizationSettings",
    icon: "settings",
    permission: "core.organization.read",
    order: 1000,
    target: { kind: "settings", section: "general" },
  },
  // Modules add theirs between 1 and 999, after the chat (SP4 Task 13).
  {
    id: "core.project.home",
    slot: "project",
    labelKey: "shell.nav.projectHome",
    icon: "layout-dashboard",
    permission: "core.project.read",
    order: 0,
    target: { kind: "project-home" },
  },
  {
    id: "core.project.chat",
    slot: "project",
    labelKey: "shell.nav.chat",
    icon: "message",
    permission: "core.conversation.send",
    order: 1,
    target: { kind: "chat" },
  },
];

/**
 * The core's own navigation (SP2 spec §7–§9): organization and project homes, every settings
 * section (the agent runtime ones of SP5 spec §7 included), every profile section in the user menu and the `/admin`
 * slots. Orders are spaced by 10 so contributions can sit in between.
 */
export const CORE_NAVIGATION: readonly ShellNavItem[] = [
  ...HOMES,
  ...SETTINGS_SECTIONS.map(
    (section, index): ShellNavItem => ({
      id: `core.settings.${section}`,
      slot: "settings",
      labelKey: `shell.nav.settings.${section}`,
      icon: SETTINGS[section].icon,
      permission: SETTINGS[section].permission,
      order: index * 10,
      target: { kind: "settings", section },
      group: SETTINGS[section].group,
    }),
  ),
  ...PROFILE_SECTIONS.map(
    (section, index): ShellNavItem => ({
      id: `core.profile.${section}`,
      slot: "user-menu",
      labelKey: `shell.nav.profile.${section}`,
      icon: PROFILE_ICONS[section],
      order: index * 10,
      target: { kind: "profile", section },
    }),
  ),
  ...ADMIN.map(
    ({ name, icon, permission, group }, index): ShellNavItem => ({
      id: `core.admin.${name}`,
      slot: "admin",
      labelKey: `shell.nav.admin.${name}`,
      icon,
      permission,
      order: index * 10,
      target: { kind: "admin", rest: name },
      group,
    }),
  ),
];
