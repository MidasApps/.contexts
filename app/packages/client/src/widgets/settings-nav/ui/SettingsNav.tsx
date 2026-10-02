"use client";

import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { usePermissions } from "#/entities/permission/index.ts";
import { routeHref, type Route } from "#/shared/lib/router/route-paths.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { groupNavItems } from "#/shared/lib/shell/group-nav-items.ts";
import { navItemRoute } from "#/shared/lib/shell/nav-item-route.ts";
import { useNavigationRegistry } from "#/shared/lib/shell/shell-registry-context.tsx";
import { NoAccessState } from "#/shared/ui/molecules/NoAccessState/NoAccessState.tsx";
import { SectionNav, type SectionNavItem } from "#/shared/ui/molecules/SectionNav/SectionNav.tsx";
import { SettingsTemplate, type SettingsTemplateProps } from "#/shared/ui/templates/SettingsTemplate/SettingsTemplate.tsx";

const pathOf = (route: Route): string => routeHref(route).split(/[?#]/u)[0] ?? "";
// A section stays current on its detail pages (`approvals/{id}`, `workflows/runs/{id}`).
const isCurrent = (sectionPath: string, locationPath: string): boolean => locationPath === sectionPath || locationPath.startsWith(`${sectionPath}/`);

/**
 * Sections of the organization settings (SP2 spec §8): the core sections, SP3/SP5 slots and one
 * entry per installed module with settings, all from the `settings` navigation slot and filtered
 * by `can()` at the organization.
 */
export function SettingsNav({ organizationId }: { organizationId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const locationPath = router.useLocationPath();
  const permissions = usePermissions({ organizationId });
  // Seventeen sections plus the modules': grouped under headings, a picker on phones (decision 0054).
  const items = groupNavItems(useNavigationRegistry().visibleItems("settings", permissions.can), (item) => item.group).flatMap(({ group, items: members }) =>
    members.flatMap((item): SectionNavItem[] => {
      const route = navItemRoute(item.target, { organizationId });
      if (route === null) return [];
      return [{ id: item.id, label: t(item.labelKey), icon: item.icon, to: route, current: isCurrent(pathOf(route), locationPath), group: t(`shell.nav.groups.${group}`) }];
    }),
  );
  return <SectionNav items={items} loading={permissions.status === "pending"} loadingLabel={t("settings.navLoading")} pickerLabel={t("settings.navPicker")} />;
}

export type SettingsPageFrameProps = {
  organizationId: string;
  /** The page header (`PageHeader` with the section title as the only `h1`). */
  header: ReactNode;
  /** The viewer holds the section's read permission; otherwise the content is a no-access state. */
  allowed: boolean;
  /** `wide` for sections whose main content is a data table (see `SettingsTemplate`). */
  width?: SettingsTemplateProps["width"] | undefined;
  children: ReactNode;
};

/**
 * Frame of every settings page: header, the labelled section navigation and the section content,
 * or `NoAccessState` when the viewer cannot read the section (the navigation stays usable).
 */
export function SettingsPageFrame({ organizationId, header, allowed, width, children }: SettingsPageFrameProps) {
  const t = useTranslations("settings");
  return (
    <SettingsTemplate
      header={header}
      navigation={<SettingsNav organizationId={organizationId} />}
      navigationLabel={t("navLabel")}
      width={allowed ? width : "reading"}
    >
      {allowed ? children : <NoAccessState description={t("noAccessDescription")} />}
    </SettingsTemplate>
  );
}
