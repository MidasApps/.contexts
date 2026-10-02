"use client";

import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { usePermissions } from "#/entities/permission/index.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { routeHref } from "#/shared/lib/router/route-paths.ts";
import { useIsImpersonating } from "#/shared/lib/session/use-impersonation.ts";
import { useNavigationRegistry } from "#/shared/lib/shell/shell-registry-context.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { SectionNav, type SectionNavItem } from "#/shared/ui/molecules/SectionNav/SectionNav.tsx";
import { SettingsTemplate, type SettingsTemplateProps } from "#/shared/ui/templates/SettingsTemplate/SettingsTemplate.tsx";

/**
 * Sections of the user's profile (SP2 spec §8): the profile items of the `user-menu` navigation
 * slot, the same source the user menu reads, so a contributed item appears in both with one icon.
 */
export function ProfileNav() {
  const t = useTranslations();
  const locationPath = useRouter().useLocationPath();
  const { can } = usePermissions();
  const items = useNavigationRegistry()
    .visibleItems("user-menu", can)
    .flatMap((item): SectionNavItem[] => {
      if (item.target.kind !== "profile") return [];
      const to = { id: "profile", section: item.target.section } as const;
      return [{ id: item.id, label: t(item.labelKey), icon: item.icon, to, current: routeHref(to) === locationPath }];
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
