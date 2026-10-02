"use client";

import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { PROFILE_SECTIONS, routeHref, type ProfileSection } from "#/shared/lib/router/route-paths.ts";
import { useIsImpersonating } from "#/shared/lib/session/use-impersonation.ts";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { SectionNav } from "#/shared/ui/molecules/SectionNav/SectionNav.tsx";
import { SettingsTemplate, type SettingsTemplateProps } from "#/shared/ui/templates/SettingsTemplate/SettingsTemplate.tsx";

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

/**
 * Support staff viewing the app as a user (read-only, SP1 spec §6.6): the controls inside are
 * disabled at once by a disabled `fieldset`, instead of saves that always fail. Views wrap only
 * what writes, so retrying a failed load or paging a list keeps working.
 */
export function ReadOnlyFieldset({ children }: { children: ReactNode }) {
  if (!useIsImpersonating()) return children;
  return (
    <fieldset disabled className="min-w-0">
      {children}
    </fieldset>
  );
}

/** The one notice of a profile page while staff view it as the user; nothing otherwise. */
function ImpersonationReadOnlyNotice() {
  const t = useTranslations("profile");
  if (!useIsImpersonating()) return null;
  return (
    <Alert variant="warning" role={undefined}>
      <Icon name="eye" />
      <AlertDescription className="text-inherit">{t("impersonationReadOnly")}</AlertDescription>
    </Alert>
  );
}

/** Frame of every profile page: header, the labelled section navigation, the content. */
export function ProfilePageFrame({ header, width, children }: { header: ReactNode; width?: SettingsTemplateProps["width"]; children: ReactNode }) {
  const t = useTranslations("profile");
  return (
    <SettingsTemplate header={header} navigation={<ProfileNav />} navigationLabel={t("navLabel")} width={width}>
      <ImpersonationReadOnlyNotice />
      {children}
    </SettingsTemplate>
  );
}
