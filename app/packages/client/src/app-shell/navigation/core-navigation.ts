import type { Permission } from "@core/contracts";
import { PROFILE_SECTIONS, SETTINGS_SECTIONS, type ProfileSection, type SettingsSection } from "#/shared/lib/router/route-paths.ts";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";
import type { ShellNavItem } from "./navigation-registry.ts";

// Read permission of each settings section (SP1 spec §7.3; SP3 spec §2.2 and SP5 spec §2.1 for the runtime ones).
const SETTINGS: Record<SettingsSection, { icon: IconName; permission: Permission }> = {
  general: { icon: "settings", permission: "core.organization.read" },
  members: { icon: "users", permission: "core.member.read" },
  invitations: { icon: "user-plus", permission: "core.member.invite" },
  roles: { icon: "shield", permission: "core.role.read" },
  units: { icon: "network", permission: "core.unit.read" },
  "api-keys": { icon: "key", permission: "core.api-key.read" },
  devices: { icon: "smartphone", permission: "core.device.read" },
  agents: { icon: "bot", permission: "core.agent-settings.read" },
  skills: { icon: "sparkles", permission: "core.agent-settings.read" },
  knowledge: { icon: "file-text", permission: "core.knowledge.read" },
  connectors: { icon: "plug", permission: "core.connector.read" },
  workflows: { icon: "workflow", permission: "core.workflow-run.read" },
  approvals: { icon: "inbox", permission: "core.approval.read" },
  usage: { icon: "chart", permission: "core.usage.read" },
  traces: { icon: "scroll-text", permission: "core.trace.read" },
  evals: { icon: "activity", permission: "core.eval.read" },
  flags: { icon: "flag", permission: "core.flag.read" },
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
const ADMIN: { name: string; icon: IconName; permission: Permission }[] = [
  { name: "organizations", icon: "building", permission: "platform.organization.read" },
  { name: "plans", icon: "credit-card", permission: "platform.plan.manage" },
  { name: "users", icon: "users", permission: "platform.user.read" },
  { name: "agents", icon: "bot", permission: "platform.agent.manage" },
  { name: "connectors", icon: "plug", permission: "platform.connector.read" },
  { name: "evals", icon: "activity", permission: "platform.eval.manage" },
  { name: "traces", icon: "scroll-text", permission: "platform.trace.read" },
  { name: "logs", icon: "list", permission: "platform.trace.read" },
  { name: "costs", icon: "wallet", permission: "platform.usage.read" },
  { name: "workflows", icon: "workflow", permission: "platform.workflow.manage" },
  { name: "flags", icon: "flag", permission: "platform.flag.manage" },
];

const HOMES: ShellNavItem[] = [
  { id: "core.organization.home", slot: "organization", labelKey: "shell.nav.organizationHome", icon: "home", permission: "core.organization.read", order: 0, target: { kind: "organization-home" } },
  { id: "core.organization.settings", slot: "organization", labelKey: "shell.nav.organizationSettings", icon: "settings", permission: "core.organization.read", order: 1000, target: { kind: "settings", section: "general" } },
  // SP4 adds its chat entry to this slot; modules add theirs between 1 and 999.
  { id: "core.project.home", slot: "project", labelKey: "shell.nav.projectHome", icon: "layout-dashboard", permission: "core.project.read", order: 0, target: { kind: "project-home" } },
];

/**
 * The core's own navigation (SP2 spec §7–§9): organization and project homes, every settings
 * section (the agent runtime ones of SP5 spec §7 included), every profile section in the user menu and the `/admin`
 * slots. Orders are spaced by 10 so contributions can sit in between.
 */
export const CORE_NAVIGATION: readonly ShellNavItem[] = [
  ...HOMES,
  ...SETTINGS_SECTIONS.map((section, index): ShellNavItem => ({
    id: `core.settings.${section}`,
    slot: "settings",
    labelKey: `shell.nav.settings.${section}`,
    icon: SETTINGS[section].icon,
    permission: SETTINGS[section].permission,
    order: index * 10,
    target: { kind: "settings", section },
  })),
  ...PROFILE_SECTIONS.map((section, index): ShellNavItem => ({
    id: `core.profile.${section}`,
    slot: "user-menu",
    labelKey: `shell.nav.profile.${section}`,
    icon: PROFILE_ICONS[section],
    order: index * 10,
    target: { kind: "profile", section },
  })),
  ...ADMIN.map(({ name, icon, permission }, index): ShellNavItem => ({
    id: `core.admin.${name}`,
    slot: "admin",
    labelKey: `shell.nav.admin.${name}`,
    icon,
    permission,
    order: index * 10,
    target: { kind: "admin", rest: name },
  })),
];
