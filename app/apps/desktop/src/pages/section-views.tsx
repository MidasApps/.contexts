import {
  PROFILE_SECTIONS,
  type ProfileSection,
  SETTINGS_SECTIONS,
  type SettingsSection,
  useRouter,
} from "@core/client/shared/lib/router";
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
import type { ComponentType } from "react";

const isOneOf = <T extends string>(values: readonly T[], value: string): value is T =>
  (values as readonly string[]).includes(value);

// From `agents` on: the agent runtime sections (SP5 spec §7); the ones with detail pages read the `rest` tail.
const SETTINGS_SECTION_VIEWS: Record<SettingsSection, ComponentType> = {
  general: SettingsGeneralView,
  members: SettingsMembersView,
  invitations: SettingsInvitationsView,
  roles: SettingsRolesView,
  units: SettingsUnitsView,
  "api-keys": SettingsApiKeysView,
  devices: SettingsDevicesView,
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

function KnownSettingsSection({ section }: { section: SettingsSection }) {
  const View = SETTINGS_SECTION_VIEWS[section];
  return <View />;
}

function KnownProfileSection({ section }: { section: ProfileSection }) {
  switch (section) {
    case "account":
      return <ProfileAccountView />;
    case "preferences":
      return <ProfilePreferencesView />;
    case "security":
      return <ProfileSecurityView />;
    case "sessions":
      return <ProfileSessionsView />;
    case "notifications":
      return <ProfileNotificationsView />;
  }
}

/** `/o/:organizationId/settings/:section` (SP2 spec §8); a section outside the route map is not found. */
export function SettingsSectionPage() {
  // The shared route map decides (as on web): an unknown section, or a tail under a section
  // without detail pages (`members/whatever`), has no params and reads as not found.
  const section = useRouter().useRouteParams()["section"];
  return section !== undefined && isOneOf(SETTINGS_SECTIONS, section) ? (
    <KnownSettingsSection section={section} />
  ) : (
    <NotFoundView />
  );
}

/** `/profile/:section` (SP2 spec §8); a section outside the route map is not found. */
export function ProfileSectionPage({ section }: { section: string }) {
  return isOneOf(PROFILE_SECTIONS, section) ? <KnownProfileSection section={section} /> : <NotFoundView />;
}
