"use client";

import { useRouter, PROFILE_SECTIONS, SETTINGS_SECTIONS, type ProfileSection, type SettingsSection } from "@core/client/shared/lib/router";
import { AdminOrganizationsView } from "@core/client/views/admin-organizations";
import { AdminOverviewView } from "@core/client/views/admin-overview";
import { AdminPlansView } from "@core/client/views/admin-plans";
import { AdminSlotView } from "@core/client/views/admin-slot";
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
import type { ComponentType } from "react";

/** The shared view of each `/o/:organizationId/settings/:section` (SP2 spec §8). */
export const SETTINGS_SECTION_VIEWS: Readonly<Record<SettingsSection, ComponentType>> = {
  general: SettingsGeneralView,
  members: SettingsMembersView,
  invitations: SettingsInvitationsView,
  roles: SettingsRolesView,
  units: SettingsUnitsView,
  "api-keys": SettingsApiKeysView,
  devices: SettingsDevicesView,
  // Slots filled by SP3 (connectors, agents) and SP5 (usage).
  connectors: SettingsSlotView,
  agents: SettingsSlotView,
  usage: SettingsSlotView,
};

/** The shared view of each `/profile/:section` (SP2 spec §8). */
export const PROFILE_SECTION_VIEWS: Readonly<Record<ProfileSection, ComponentType>> = {
  account: ProfileAccountView,
  preferences: ProfilePreferencesView,
  security: ProfileSecurityView,
  sessions: ProfileSessionsView,
  notifications: ProfileNotificationsView,
};

const isOneOf = <T extends string>(values: readonly T[], value: string | undefined): value is T => value !== undefined && (values as readonly string[]).includes(value);

/** `[section]` of the settings route: the section's view, not-found for an unknown one. */
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
const ADMIN_AREA_VIEWS: Readonly<Record<string, (segments: readonly string[]) => ComponentType | null>> = {
  organizations: (segments) => (segments.length === 0 ? AdminOrganizationsView : null),
  plans: (segments) => (segments.length === 0 ? AdminPlansView : null),
};

/** `/admin/[[...section]]`: the overview at the root, the area's view below it. */
export function AdminPage() {
  const rest = useRouter().useRouteParams()["rest"] ?? "";
  if (rest === "") return <AdminOverviewView />;
  const [area = "", ...segments] = rest.split("/");
  const View = (Object.hasOwn(ADMIN_AREA_VIEWS, area) ? ADMIN_AREA_VIEWS[area]?.(segments) : null) ?? AdminSlotView;
  return <View />;
}
