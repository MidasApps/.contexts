import { PROFILE_SECTIONS, SETTINGS_SECTIONS, useRouter, type ProfileSection, type SettingsSection } from "@core/client/shared/lib/router";
import { NotFoundView } from "@core/client/views/not-found";
import { ProfileAccountView } from "@core/client/views/profile-account";
import { ProfileNotificationsView } from "@core/client/views/profile-notifications";
import { ProfilePreferencesView } from "@core/client/views/profile-preferences";
import { ProfileSecurityView } from "@core/client/views/profile-security";
import { ProfileSessionsView } from "@core/client/views/profile-sessions";
import { SettingsApiKeysView } from "@core/client/views/settings-api-keys";
import { SettingsDevicesView } from "@core/client/views/settings-devices";
import { SettingsGeneralView } from "@core/client/views/settings-general";
import { SettingsInvitationsView } from "@core/client/views/settings-invitations";
import { SettingsMembersView } from "@core/client/views/settings-members";
import { SettingsRolesView } from "@core/client/views/settings-roles";
import { SettingsUnitsView } from "@core/client/views/settings-units";
import { SettingsAgentsView } from "@core/client/views/settings-agents";
import { SettingsSkillsView } from "@core/client/views/settings-skills";
import { SettingsKnowledgeView } from "@core/client/views/settings-knowledge";
import { SettingsConnectorsView } from "@core/client/views/settings-connectors";
import { SettingsWorkflowsView } from "@core/client/views/settings-workflows";
import { SettingsApprovalsView } from "@core/client/views/settings-approvals";
import { SettingsUsageView } from "@core/client/views/settings-usage";
import { SettingsTracesView } from "@core/client/views/settings-traces";
import { SettingsEvalsView } from "@core/client/views/settings-evals";
import { SettingsFlagsView } from "@core/client/views/settings-flags";

const isOneOf = <T extends string>(values: readonly T[], value: string): value is T => (values as readonly string[]).includes(value);

function KnownSettingsSection({ section }: { section: SettingsSection }) {
  switch (section) {
    case "general":
      return <SettingsGeneralView />;
    case "members":
      return <SettingsMembersView />;
    case "invitations":
      return <SettingsInvitationsView />;
    case "roles":
      return <SettingsRolesView />;
    case "units":
      return <SettingsUnitsView />;
    case "api-keys":
      return <SettingsApiKeysView />;
    case "devices":
      return <SettingsDevicesView />;
    // The agent runtime sections (SP5 spec §7); the ones with detail pages read the `rest` tail.
    case "agents":
      return <SettingsAgentsView />;
    case "skills":
      return <SettingsSkillsView />;
    case "knowledge":
      return <SettingsKnowledgeView />;
    case "connectors":
      return <SettingsConnectorsView />;
    case "workflows":
      return <SettingsWorkflowsView />;
    case "approvals":
      return <SettingsApprovalsView />;
    case "usage":
      return <SettingsUsageView />;
    case "traces":
      return <SettingsTracesView />;
    case "evals":
      return <SettingsEvalsView />;
    case "flags":
      return <SettingsFlagsView />;
  }
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
  return section !== undefined && isOneOf(SETTINGS_SECTIONS, section) ? <KnownSettingsSection section={section} /> : <NotFoundView />;
}

/** `/profile/:section` (SP2 spec §8); a section outside the route map is not found. */
export function ProfileSectionPage({ section }: { section: string }) {
  return isOneOf(PROFILE_SECTIONS, section) ? <KnownProfileSection section={section} /> : <NotFoundView />;
}
