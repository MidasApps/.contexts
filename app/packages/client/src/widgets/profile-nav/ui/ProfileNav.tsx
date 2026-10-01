"use client";

import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { PROFILE_SECTIONS, routeHref, type ProfileSection } from "#/shared/lib/router/route-paths.ts";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";
import { SectionNav } from "#/shared/ui/molecules/SectionNav/SectionNav.tsx";
import { SettingsTemplate } from "#/shared/ui/templates/SettingsTemplate/SettingsTemplate.tsx";

const ICONS: Record<ProfileSection, IconName> = {
  account: "user",
  preferences: "languages",
  security: "shield-check",
  sessions: "monitor",
  notifications: "bell",
};

/** Sections of the user's profile (SP2 spec §8); no permission gates them (user-level data). */
export function ProfileNav() {
  const t = useTranslations("shell.nav.profile");
  const locationPath = useRouter().useLocationPath();
  const items = PROFILE_SECTIONS.map((section) => {
    const to = { id: "profile", section } as const;
    return { id: section, label: t(section), icon: ICONS[section], to, current: routeHref(to) === locationPath };
  });
  return <SectionNav items={items} />;
}

/** Frame of every profile page: header, the labelled section navigation, the content. */
export function ProfilePageFrame({ header, children }: { header: ReactNode; children: ReactNode }) {
  const t = useTranslations("profile");
  return (
    <SettingsTemplate header={header} navigation={<ProfileNav />} navigationLabel={t("navLabel")}>
      {children}
    </SettingsTemplate>
  );
}
