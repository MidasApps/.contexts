"use client";

import type { NavSlot } from "@core/contracts";
import { type ReactNode, useId } from "react";
import { useTranslations } from "use-intl";
import { usePermissions } from "#/entities/permission/index.ts";
import { useCurrentNode } from "#/entities/session/index.ts";
import { RouteLink, useRouter } from "#/shared/lib/router/router-context.tsx";
import { navItemRoute } from "#/shared/lib/shell/nav-item-route.ts";
import { useNavigationRegistry } from "#/shared/lib/shell/shell-registry-context.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Sidebar, SidebarRail } from "#/shared/ui/organisms/Sidebar/Sidebar.tsx";
import { useCloseMobileSidebarOnChange } from "#/shared/ui/organisms/Sidebar/sidebar-context.tsx";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "#/shared/ui/organisms/Sidebar/sidebar-menu.tsx";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
} from "#/shared/ui/organisms/Sidebar/sidebar-sections.tsx";
import { isRouteActive } from "../model/active-route.ts";

function NavGroup({ slot, label }: { slot: Extract<NavSlot, "organization" | "project">; label: string }) {
  const t = useTranslations();
  const labelId = useId();
  const router = useRouter();
  const locationPath = router.useLocationPath();
  const node = useCurrentNode();
  const permissions = usePermissions();
  const routes = useNavigationRegistry()
    .visibleItems(slot, permissions.can)
    .flatMap((item) => {
      const route = navItemRoute(item.target, node ?? {});
      return route === null ? [] : [{ item, route }];
    });
  if (permissions.status === "success" && routes.length === 0) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel id={labelId}>{label}</SidebarGroupLabel>
      {permissions.status === "pending" ? (
        <div role="status" aria-label={t("shell.sidebar.loading")}>
          {[0, 1, 2].map((index) => (
            <SidebarMenuSkeleton key={index} index={index} />
          ))}
        </div>
      ) : permissions.status === "error" ? (
        <SidebarMenu aria-labelledby={labelId}>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={permissions.refetch} tooltip={t("shell.sidebar.retry")}>
              <Icon name="refresh" />
              <span>{t("shell.sidebar.retry")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      ) : (
        <SidebarMenu aria-labelledby={labelId}>
          {routes.map(({ item, route }) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton asChild isActive={isRouteActive(route, locationPath)} tooltip={t(item.labelKey)}>
                <RouteLink to={route}>
                  <Icon name={item.icon} />
                  <span>{t(item.labelKey)}</span>
                </RouteLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      )}
    </SidebarGroup>
  );
}

export type AppSidebarProps = {
  /** Top of the sidebar: the organization switcher (composed by the app layout). */
  header: ReactNode;
  /** Project switcher and unit picker, shown under the header. */
  context?: ReactNode;
  /** Bottom: the user menu. */
  footer: ReactNode;
};

/**
 * The user area's sidebar (SP2 spec §9, shadcn `sidebar-07`): switchers on top, the `project` and
 * `organization` navigation slots filtered by `can()` at the URL node (core, module and SP4/SP5
 * items alike), the user menu at the bottom. Collapses to icons (⌘B / Ctrl+B) and becomes a
 * labelled sheet on small screens, closed again whenever the path changes. The switchers and menu come in as slots (FSD: a widget does not
 * import other widgets; the app layer composes them).
 */
export function AppSidebar({ header, context, footer }: AppSidebarProps) {
  const t = useTranslations("shell.sidebar");
  const node = useCurrentNode();
  // Path only: the unit picker's `?unit=` keeps the user on the same page, so the sheet stays.
  useCloseMobileSidebarOnChange(useRouter().useLocationPath());
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>{header}</SidebarHeader>
      <SidebarContent>
        {context === undefined || node === null ? null : <SidebarGroup className="gap-0.5">{context}</SidebarGroup>}
        <nav aria-label={t("title")} className="flex flex-col">
          {node?.projectId === undefined ? null : <NavGroup slot="project" label={t("projectGroup")} />}
          {node === null ? null : <NavGroup slot="organization" label={t("organizationGroup")} />}
        </nav>
      </SidebarContent>
      <SidebarFooter>{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
