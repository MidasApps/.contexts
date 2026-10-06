"use client";

// The views of the settings route only: one file per route keeps each page bundle to its own views,
// so a member opening settings or profile never downloads the admin console (decision 0042).
import { SETTINGS_SECTIONS, type SettingsSection, useRouter } from "@core/client/shared/lib/router";
import { NotFoundView } from "@core/client/views/not-found";
import { SettingsAgentsView } from "@core/client/views/settings-agents";
import { SettingsApiKeysView } from "@core/client/views/settings-api-keys";
import { SettingsApprovalsView } from "@core/client/views/settings-approvals";
import { SettingsAuditLogView } from "@core/client/views/settings-audit-log";
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
import type { ComponentType } from "react";

/** The shared view of each `/o/:organizationId/settings/:section` (SP2 spec §8). */
export const SETTINGS_SECTION_VIEWS: Readonly<Record<SettingsSection, ComponentType>> = {
  general: SettingsGeneralView,
  members: SettingsMembersView,
  invitations: SettingsInvitationsView,
  roles: SettingsRolesView,
  units: SettingsUnitsView,
  "audit-log": SettingsAuditLogView,
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

const isOneOf = <T extends string>(values: readonly T[], value: string | undefined): value is T =>
  value !== undefined && (values as readonly string[]).includes(value);

/** `[section]/[[...rest]]` of the settings route: the section's view (it reads the `rest` tail), not-found for an unknown one. */
export function SettingsSectionPage() {
  const section = useRouter().useRouteParams()["section"];
  const View = isOneOf(SETTINGS_SECTIONS, section) ? SETTINGS_SECTION_VIEWS[section] : NotFoundView;
  return <View />;
}
