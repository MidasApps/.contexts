"use client";

import { useId, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { RouteLink, useRouter } from "#/shared/lib/router/router-context.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Sidebar, SidebarRail } from "#/shared/ui/organisms/Sidebar/Sidebar.tsx";
import { useCloseMobileSidebarOnChange } from "#/shared/ui/organisms/Sidebar/sidebar-context.tsx";
import { SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader } from "#/shared/ui/organisms/Sidebar/sidebar-sections.tsx";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSkeleton } from "#/shared/ui/organisms/Sidebar/sidebar-menu.tsx";
import { groupNavItems } from "#/shared/lib/shell/group-nav-items.ts";
import type { NavGroup } from "#/shared/lib/shell/shell-types.ts";
import { isAdminAreaActive, useAdminItems, type AdminItem } from "../model/use-admin-items.ts";

function AdminNavGroup() {
  const t = useTranslations();
  const labelId = useId();
  const { permissions } = useAdminItems();
  return (
    <SidebarGroup>
      <SidebarGroupLabel id={labelId}>{t("admin.sidebar.group")}</SidebarGroupLabel>
      {permissions.status === "pending" ? (
        <div role="status" aria-label={t("admin.sidebar.loading")}>
          {[0, 1, 2].map((index) => (
            <SidebarMenuSkeleton key={index} index={index} />
          ))}
        </div>
      ) : permissions.status === "error" ? (
        <SidebarMenu aria-labelledby={labelId}>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={permissions.refetch} tooltip={t("admin.sidebar.retry")}>
              <Icon name="refresh" />
              <span>{t("admin.sidebar.retry")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      ) : null}
    </SidebarGroup>
  );
}

/** One heading of the admin areas (decision 0055) with the areas under it. */
function AdminAreaGroup({ group, items }: { group: NavGroup; items: readonly AdminItem[] }) {
  const t = useTranslations();
  const labelId = useId();
  const locationPath = useRouter().useLocationPath();
  return (
    <SidebarGroup>
      <SidebarGroupLabel id={labelId}>{t(`shell.nav.groups.${group}`)}</SidebarGroupLabel>
      <SidebarMenu aria-labelledby={labelId}>
        {items.map(({ item, route }) => (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton asChild isActive={isAdminAreaActive(route, locationPath)} tooltip={t(item.labelKey)}>
              <RouteLink to={route}>
                <Icon name={item.icon} />
                <span>{t(item.labelKey)}</span>
              </RouteLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

/** The admin areas the role may open, grouped under headings; one "Platform" group while access loads or fails. */
function AdminNav() {
  const { items, permissions } = useAdminItems();
  if (permissions.status !== "success") return <AdminNavGroup />;
  return (
    <>
      {groupNavItems(items, ({ item }) => item.group).map(({ group, items: members }) => (
        <AdminAreaGroup key={group} group={group} items={members} />
      ))}
    </>
  );
}

export type AdminSidebarProps = {
  /** Bottom: the user menu (composed by the app layer; widgets do not import widgets). */
  footer: ReactNode;
};

/**
 * Sidebar of the `/admin` surface (SP2 spec §7, web only): the surface name linking to the admin
 * home, a way back to the user area, and the `admin` navigation slot filtered by the staff role's
 * platform permissions. Collapses to icons like the app sidebar; the phone sheet closes on navigation.
 */
export function AdminSidebar({ footer }: AdminSidebarProps) {
  const t = useTranslations("admin.sidebar");
  const locationPath = useRouter().useLocationPath();
  useCloseMobileSidebarOnChange(locationPath);
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" isActive={locationPath === "/admin"} tooltip={t("title")}>
              <RouteLink to={{ id: "admin", rest: "" }}>
                <Icon name="shield" />
                <span className="font-semibold">{t("title")}</span>
              </RouteLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label={t("navLabel")} className="flex flex-col">
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={t("backToApp")}>
                  <RouteLink to={{ id: "home" }}>
                    <Icon name="arrow-left" />
                    <span>{t("backToApp")}</span>
                  </RouteLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <AdminNav />
        </nav>
      </SidebarContent>
      <SidebarFooter>{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
