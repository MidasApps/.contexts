"use client";

import { type ReactNode, useId } from "react";
import { useTranslations } from "use-intl";
import type { PermissionsState } from "#/entities/permission/index.ts";
import { useAdminOrganizationId, useMe } from "#/entities/session/index.ts";
import { usePlatform } from "#/shared/lib/platform/index.ts";
import type { Route } from "#/shared/lib/router/route-paths.ts";
import { RouteLink, useRouter } from "#/shared/lib/router/router-context.tsx";
import { groupNavItems } from "#/shared/lib/shell/group-nav-items.ts";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";
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
import {
  type AdminContext,
  type AdminItem,
  adminContextOf,
  isAdminAreaActive,
  useAccountItems,
  useAdminItems,
  useOrganizationAdminItems,
} from "../model/use-admin-items.ts";

/** One heading with its sections, each marked current on its own page and its sub-pages. */
function AdminItemGroup({ label, items }: { label: string; items: readonly AdminItem[] }) {
  const t = useTranslations();
  const labelId = useId();
  const locationPath = useRouter().useLocationPath();
  return (
    <SidebarGroup>
      <SidebarGroupLabel id={labelId}>{label}</SidebarGroupLabel>
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

/** Skeleton rows while the permissions load, a retry when they fail. */
function PermissionsPlaceholder({ label, permissions }: { label: string; permissions: PermissionsState }) {
  const t = useTranslations("admin.sidebar");
  const labelId = useId();
  return (
    <SidebarGroup>
      <SidebarGroupLabel id={labelId}>{label}</SidebarGroupLabel>
      {permissions.status === "error" ? (
        <SidebarMenu aria-labelledby={labelId}>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={permissions.refetch} tooltip={t("retry")}>
              <Icon name="refresh" />
              <span>{t("retry")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      ) : (
        <div role="status" aria-label={t("loading")}>
          {[0, 1, 2].map((index) => (
            <SidebarMenuSkeleton key={index} index={index} />
          ))}
        </div>
      )}
    </SidebarGroup>
  );
}

/** Items under the navigation headings (decision 0055), or the placeholder while access loads. */
function GroupedItems({
  items,
  permissions,
  placeholderLabel,
}: {
  items: readonly AdminItem[];
  permissions: PermissionsState;
  placeholderLabel: string;
}) {
  const t = useTranslations();
  if (permissions.status !== "success")
    return <PermissionsPlaceholder label={placeholderLabel} permissions={permissions} />;
  return groupNavItems(items, ({ item }) => item.group).map(({ group, items: members }) => (
    <AdminItemGroup key={group} label={t(`shell.nav.groups.${group}`)} items={members} />
  ));
}

/** The organization's settings sections the viewer may read, grouped (organization, access, AI, operations, modules). */
function OrganizationSections({ organizationId }: { organizationId: string }) {
  const t = useTranslations("admin.sidebar");
  const { items, permissions } = useOrganizationAdminItems(organizationId);
  return <GroupedItems items={items} permissions={permissions} placeholderLabel={t("organizationGroup")} />;
}

/** The platform console's areas the staff role may open, grouped (customers, AI, operations). */
function PlatformAreas() {
  const t = useTranslations("admin.sidebar");
  const { items, permissions } = useAdminItems();
  return <GroupedItems items={items} permissions={permissions} placeholderLabel={t("group")} />;
}

function AccountSections() {
  const t = useTranslations("admin.sidebar");
  return <AdminItemGroup label={t("accountGroup")} items={useAccountItems()} />;
}

/** No organization to administer yet (a new user, or staff outside every organization). */
function NoOrganization() {
  const t = useTranslations("admin.sidebar");
  return (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip={t("chooseOrganization")}>
            <RouteLink to={{ id: "organizations" }}>
              <Icon name="building" />
              <span>{t("chooseOrganization")}</span>
            </RouteLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}

type Shortcut = { readonly key: string; readonly label: string; readonly icon: IconName; readonly to: Route };

/**
 * The ways out of the current part (decision 0077): the organization's settings from the account or
 * the console, the console for staff on web (the desktop has none), and back to the application.
 */
const useShortcuts = (context: AdminContext, organizationId: string | undefined): Shortcut[] => {
  const t = useTranslations("admin.sidebar");
  const me = useMe();
  const web = usePlatform().kind === "web";
  const shortcuts: Shortcut[] = [];
  if (context !== "organization" && organizationId !== undefined)
    shortcuts.push({
      key: "organization",
      label: t("organizationSettings"),
      icon: "building",
      to: { id: "settings-index", organizationId },
    });
  if (context !== "platform" && web && me.data?.isPlatformStaff === true)
    shortcuts.push({ key: "platform", label: t("platformConsole"), icon: "shield", to: { id: "admin", rest: "" } });
  shortcuts.push({
    key: "app",
    label: t("openApp"),
    icon: "layout-dashboard",
    to: organizationId === undefined ? { id: "home" } : { id: "organization", organizationId },
  });
  return shortcuts;
};

function Shortcuts({ context, organizationId }: { context: AdminContext; organizationId: string | undefined }) {
  const t = useTranslations("admin.sidebar");
  const labelId = useId();
  const shortcuts = useShortcuts(context, organizationId);
  return (
    <SidebarGroup className="mt-auto">
      <SidebarGroupLabel id={labelId}>{t("goTo")}</SidebarGroupLabel>
      <SidebarMenu aria-labelledby={labelId}>
        {shortcuts.map((shortcut) => (
          <SidebarMenuItem key={shortcut.key}>
            <SidebarMenuButton asChild tooltip={shortcut.label}>
              <RouteLink to={shortcut.to}>
                <Icon name={shortcut.icon} />
                <span>{shortcut.label}</span>
              </RouteLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function ContextSections({ context, organizationId }: { context: AdminContext; organizationId: string | undefined }) {
  if (context === "platform") return <PlatformAreas />;
  if (context === "account") return <AccountSections />;
  return organizationId === undefined ? <NoOrganization /> : <OrganizationSections organizationId={organizationId} />;
}

export type AdminSidebarProps = {
  /** Top: the organization switcher, leading to the picked organization's administration (app layer). */
  header: ReactNode;
  /** Bottom: the user menu (composed by the app layer; widgets do not import widgets). */
  footer: ReactNode;
};

/**
 * Sidebar of the administration (`/admin`, decision 0077): the sections of the part the page is in
 * — an organization's settings, the user's account or, for staff, the platform console — grouped
 * under headings and filtered by what the viewer may read, then the ways to the other parts and
 * back to the application. Collapses to icons like the app sidebar; the phone sheet closes on
 * navigation.
 */
export function AdminSidebar({ header, footer }: AdminSidebarProps) {
  const t = useTranslations("admin.sidebar");
  const locationPath = useRouter().useLocationPath();
  const context = adminContextOf(locationPath);
  const organizationId = useAdminOrganizationId();
  useCloseMobileSidebarOnChange(locationPath);
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>{header}</SidebarHeader>
      <SidebarContent>
        <nav aria-label={t("navLabel")} className="flex flex-1 flex-col">
          <ContextSections context={context} organizationId={organizationId} />
          <Shortcuts context={context} organizationId={organizationId} />
        </nav>
      </SidebarContent>
      <SidebarFooter>{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
