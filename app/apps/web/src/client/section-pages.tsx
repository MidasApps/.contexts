"use client";

import {
  PROFILE_SECTIONS,
  type ProfileSection,
  SETTINGS_SECTIONS,
  type SettingsSection,
  useRouter,
} from "@core/client/shared/lib/router";
import { AdminAgentPromptsView } from "@core/client/views/admin-agent-prompts";
import { AdminAgentsView } from "@core/client/views/admin-agents";
import { AdminConnectorsView } from "@core/client/views/admin-connectors";
import { AdminCostsView } from "@core/client/views/admin-costs";
import { AdminEvalsView } from "@core/client/views/admin-evals";
import { AdminFlagsView } from "@core/client/views/admin-flags";
import { AdminLogsView } from "@core/client/views/admin-logs";
import { AdminOrganizationDetailView } from "@core/client/views/admin-organization-detail";
import { AdminOrganizationsView } from "@core/client/views/admin-organizations";
import { AdminOverviewView } from "@core/client/views/admin-overview";
import { AdminPlansView } from "@core/client/views/admin-plans";
import { AdminSlotView } from "@core/client/views/admin-slot";
import { AdminTraceDetailView } from "@core/client/views/admin-trace-detail";
import { AdminTracesView } from "@core/client/views/admin-traces";
import { AdminUsersView } from "@core/client/views/admin-users";
import { AdminWorkflowsView } from "@core/client/views/admin-workflows";
import { NotFoundView } from "@core/client/views/not-found";
import { ProfileAccountView } from "@core/client/views/profile-account";
import { ProfileNotificationsView } from "@core/client/views/profile-notifications";
import { ProfilePreferencesView } from "@core/client/views/profile-preferences";
import { ProfileSecurityView } from "@core/client/views/profile-security";
import { ProfileSessionsView } from "@core/client/views/profile-sessions";
import { SettingsAgentsView } from "@core/client/views/settings-agents";
import { SettingsApiKeysView } from "@core/client/views/settings-api-keys";
import { SettingsApprovalsView } from "@core/client/views/settings-approvals";
import { SettingsConnectorsView } from "@core/client/views/settings-connectors";
import { SettingsDevicesView } from "@core/client/views/settings-devices";
import { SettingsEvalsView } from "@core/client/views/settings-evals";
import { SettingsFlagsView } from "@core/client/views/settings-flags";
import { SettingsGeneralView } from "@core/client/views/settings-general";
import { SettingsInvitationsView } from "@core/client/views/settings-invitations";
import { SettingsKnowledgeView } from "@core/client/views/settings-knowledge";
import { SettingsMembersView } from "@core/client/views/settings-members";
import { SettingsRolesView } from "@core/client/views/settings-roles";
import { SettingsSkillsView } from "@core/client/views/settings-skills";
import { SettingsTracesView } from "@core/client/views/settings-traces";
import { SettingsUnitsView } from "@core/client/views/settings-units";
import { SettingsUsageView } from "@core/client/views/settings-usage";
import { SettingsWorkflowsView } from "@core/client/views/settings-workflows";
import { type ComponentType, createElement } from "react";

/** The shared view of each `/o/:organizationId/settings/:section` (SP2 spec §8). */
export const SETTINGS_SECTION_VIEWS: Readonly<Record<SettingsSection, ComponentType>> = {
  general: SettingsGeneralView,
  members: SettingsMembersView,
  invitations: SettingsInvitationsView,
  roles: SettingsRolesView,
  units: SettingsUnitsView,
  "api-keys": SettingsApiKeysView,
  devices: SettingsDevicesView,
  // The agent runtime sections (SP5 spec §7); the ones with detail pages read the `rest` tail.
  agents: SettingsAgentsView,
  skills: SettingsSkillsView,
  knowledge: SettingsKnowledgeView,
  connectors: SettingsConnectorsView,
  workflows: SettingsWorkflowsView,
  approvals: SettingsApprovalsView,
  usage: SettingsUsageView,
  traces: SettingsTracesView,
  evals: SettingsEvalsView,
  flags: SettingsFlagsView,
};

/** The shared view of each `/profile/:section` (SP2 spec §8). */
export const PROFILE_SECTION_VIEWS: Readonly<Record<ProfileSection, ComponentType>> = {
  account: ProfileAccountView,
  preferences: ProfilePreferencesView,
  security: ProfileSecurityView,
  sessions: ProfileSessionsView,
  notifications: ProfileNotificationsView,
};

const isOneOf = <T extends string>(values: readonly T[], value: string | undefined): value is T =>
  value !== undefined && (values as readonly string[]).includes(value);

/** `[section]/[[...rest]]` of the settings route: the section's view (it reads the `rest` tail), not-found for an unknown one. */
export function SettingsSectionPage() {
  const section = useRouter().useRouteParams()["section"];
  const View = isOneOf(SETTINGS_SECTIONS, section) ? SETTINGS_SECTION_VIEWS[section] : NotFoundView;
  return <View />;
}

/** `[section]` of the profile route. */
export function ProfileSectionPage() {
  const section = useRouter().useRouteParams()["section"];
  const View = isOneOf(PROFILE_SECTIONS, section) ? PROFILE_SECTION_VIEWS[section] : NotFoundView;
  return <View />;
}

/**
 * The shared view of an `/admin/<area>/…` path (SP5 spec §6): `segments` are the path parts after
 * the area. `null` falls through to `AdminSlotView` (module areas, or not-found).
 */
const only = (View: ComponentType) => (segments: readonly string[]) => (segments.length === 0 ? View : null);
const withDetail = (List: ComponentType, Detail: ComponentType) => (segments: readonly string[]) =>
  segments.length === 0 ? List : segments.length === 1 ? Detail : null;

const ADMIN_AREA_VIEWS: Readonly<Record<string, (segments: readonly string[]) => ComponentType | null>> = {
  organizations: withDetail(AdminOrganizationsView, AdminOrganizationDetailView),
  plans: only(AdminPlansView),
  users: only(AdminUsersView),
  agents: (segments) =>
    segments.length === 0
      ? AdminAgentsView
      : segments.length === 2 && segments[1] === "prompts"
        ? AdminAgentPromptsView
        : null,
  connectors: only(AdminConnectorsView),
  evals: only(AdminEvalsView),
  traces: withDetail(AdminTracesView, AdminTraceDetailView),
  logs: only(AdminLogsView),
  costs: only(AdminCostsView),
  workflows: only(AdminWorkflowsView),
  flags: only(AdminFlagsView),
};

/** The view of an `/admin` path: the overview at the root, the area's view below it. */
const adminViewOf = (rest: string): ComponentType => {
  if (rest === "") return AdminOverviewView;
  const [area = "", ...segments] = rest.split("/");
  return (Object.hasOwn(ADMIN_AREA_VIEWS, area) ? ADMIN_AREA_VIEWS[area]?.(segments) : null) ?? AdminSlotView;
};

/** `/admin/[[...section]]`. */
export function AdminPage() {
  const rest = useRouter().useRouteParams()["rest"] ?? "";
  return createElement(adminViewOf(rest));
}
