"use client";

// The views of the profile route only: one file per route keeps each page bundle to its own views,
// so a member opening settings or profile never downloads the admin console (decision 0042).
import { PROFILE_SECTIONS, type ProfileSection, useRouter } from "@core/client/shared/lib/router";
import { NotFoundView } from "@core/client/views/not-found";
import { ProfileAccountView } from "@core/client/views/profile-account";
import { ProfileNotificationsView } from "@core/client/views/profile-notifications";
import { ProfilePreferencesView } from "@core/client/views/profile-preferences";
import { ProfileSecurityView } from "@core/client/views/profile-security";
import { ProfileSessionsView } from "@core/client/views/profile-sessions";
import type { ComponentType } from "react";

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

/** `[section]` of the profile route. */
export function ProfileSectionPage() {
  const section = useRouter().useRouteParams()["section"];
  const View = isOneOf(PROFILE_SECTIONS, section) ? PROFILE_SECTION_VIEWS[section] : NotFoundView;
  return <View />;
}
