import { PROFILE_SECTIONS, SETTINGS_SECTIONS, type ProfileSection, type SettingsSection } from "@core/client/shared/lib/router";
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
import { SettingsSlotView } from "@core/client/views/settings-slot";
import { SettingsUnitsView } from "@core/client/views/settings-units";

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
    // SP5 Task 14 fills these; until its pages land they are slots or not found.
    case "connectors":
    case "agents":
    case "usage":
      return <SettingsSlotView />;
    case "skills":
    case "knowledge":
    case "workflows":
    case "approvals":
    case "traces":
    case "evals":
    case "flags":
      return <NotFoundView />;
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
export function SettingsSectionPage({ section }: { section: string }) {
  return isOneOf(SETTINGS_SECTIONS, section) ? <KnownSettingsSection section={section} /> : <NotFoundView />;
}

/** `/profile/:section` (SP2 spec §8); a section outside the route map is not found. */
export function ProfileSectionPage({ section }: { section: string }) {
  return isOneOf(PROFILE_SECTIONS, section) ? <KnownProfileSection section={section} /> : <NotFoundView />;
}
