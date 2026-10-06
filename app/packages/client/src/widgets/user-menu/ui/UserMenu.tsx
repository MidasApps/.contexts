"use client";

import { useTranslations } from "use-intl";
import { usePermissions } from "#/entities/permission/index.ts";
import { useCurrentNode, useMe } from "#/entities/session/index.ts";
import { useSignOut } from "#/features/sign-out/index.ts";
import { useSaveThemePreference } from "#/features/update-preferences/index.ts";
import { usePlatform } from "#/shared/lib/platform/platform-context.tsx";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { navItemRoute } from "#/shared/lib/shell/nav-item-route.ts";
import { useNavigationRegistry } from "#/shared/lib/shell/shell-registry-context.tsx";
import { THEME_PREFERENCES, type ThemePreference } from "#/shared/lib/theme/theme-provider.tsx";
import { Avatar } from "#/shared/ui/atoms/Avatar/Avatar.tsx";
import { Badge } from "#/shared/ui/atoms/Badge/Badge.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";
import { Skeleton } from "#/shared/ui/atoms/Skeleton/Skeleton.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "#/shared/ui/molecules/DropdownMenu/DropdownMenu.tsx";
import { useSidebar } from "#/shared/ui/organisms/Sidebar/sidebar-context.tsx";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "#/shared/ui/organisms/Sidebar/sidebar-menu.tsx";

import { useWaitingApprovals } from "../model/use-waiting-approvals.ts";

const THEME_ICONS: Record<ThemePreference, IconName> = { system: "monitor", light: "sun", dark: "moon" };

function ThemeSubmenu() {
  const t = useTranslations("shell.userMenu");
  const theme = useSaveThemePreference();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Icon name={THEME_ICONS[theme.preference]} />
        {t("theme")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={theme.preference}
          onValueChange={(value) => {
            const preference = THEME_PREFERENCES.find((candidate) => candidate === value);
            if (preference !== undefined) theme.save(preference);
          }}
        >
          {THEME_PREFERENCES.map((preference) => (
            <DropdownMenuRadioItem key={preference} value={preference}>
              {t(`themes.${preference}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** Entry to the approvals inbox with the number of requests waiting for the viewer's decision. */
function ApprovalsMenuItem({ organizationId, count }: { organizationId: string; count: number }) {
  const t = useTranslations("common.approvals.menu");
  return (
    <DropdownMenuItem asChild>
      <RouteLink
        to={{ id: "settings", organizationId, section: "approvals" }}
        aria-label={count > 0 ? t("labelWithWaiting", { count }) : t("label")}
      >
        <Icon name="inbox" />
        {t("label")}
        {count > 0 ? (
          <Badge className="ms-auto" aria-hidden="true">
            {count}
          </Badge>
        ) : null}
      </RouteLink>
    </DropdownMenuItem>
  );
}

/** Entry to the user guide (decision 0073); the guide is a web page, so the desktop has none. */
function DocsMenuItem() {
  const t = useTranslations("shell.userMenu");
  if (usePlatform().kind !== "web") return null;
  return (
    <DropdownMenuItem asChild>
      <RouteLink to={{ id: "docs", page: "" }}>
        <Icon name="file-text" />
        {t("docs")}
      </RouteLink>
    </DropdownMenuItem>
  );
}

/**
 * User menu at the sidebar footer (sidebar-07 nav-user): who is signed in, the profile sections
 * from the `user-menu` navigation slot, the approvals inbox with its waiting count (holders of
 * `core.approval.read` in the organization), theme (system/light/dark), language (profile
 * preferences), the user guide and sign out.
 */
export function UserMenu() {
  const t = useTranslations();
  const { isMobile } = useSidebar();
  const me = useMe();
  const node = useCurrentNode();
  const { can } = usePermissions();
  const items = useNavigationRegistry().visibleItems("user-menu", can);
  const { signOut } = useSignOut();
  const approvals = useWaitingApprovals();
  const waiting = approvals?.count ?? 0;
  const name = me.data === undefined ? "" : me.data.displayName.trim() === "" ? me.data.email : me.data.displayName;
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={name}
              aria-label={
                waiting > 0
                  ? t("common.approvals.menu.triggerWithWaiting", { name, count: waiting })
                  : t("shell.userMenu.trigger", { name })
              }
              className="data-[state=open]:bg-sidebar-accent"
            >
              <span className="relative">
                {me.data === undefined ? (
                  <Skeleton className="size-8 rounded-full" />
                ) : (
                  <Avatar name={name} size="sm" decorative className="size-8" />
                )}
                {waiting > 0 ? (
                  <span
                    aria-hidden="true"
                    data-slot="approvals-dot"
                    className="absolute -top-0.5 -end-0.5 size-2.5 rounded-full border-2 border-sidebar bg-amber"
                  />
                ) : null}
              </span>
              <span className="grid min-w-0 flex-1 text-start leading-tight">
                {me.data === undefined ? (
                  <Skeleton className="h-4 w-28" />
                ) : (
                  <>
                    <span className="truncate text-body font-medium">{name}</span>
                    <span className="truncate text-caption text-muted-foreground">{me.data.email}</span>
                  </>
                )}
              </span>
              <Icon name="chevron-down" className="ms-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "top" : "right"} align="end" sideOffset={4} className="min-w-60">
            <DropdownMenuLabel className="normal-case tracking-normal">
              <span className="block truncate text-body font-medium text-foreground">{name}</span>
              {me.data === undefined ? null : (
                <span className="block truncate font-sans text-xs text-muted-foreground">{me.data.email}</span>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {items.map((item) => {
                const route = navItemRoute(item.target, node ?? {});
                if (route === null) return null;
                return (
                  <DropdownMenuItem key={item.id} asChild>
                    <RouteLink to={route}>
                      <Icon name={item.icon} />
                      {t(item.labelKey)}
                    </RouteLink>
                  </DropdownMenuItem>
                );
              })}
              {approvals === null ? null : (
                <ApprovalsMenuItem organizationId={approvals.organizationId} count={approvals.count} />
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <ThemeSubmenu />
            <DropdownMenuItem asChild>
              <RouteLink to={{ id: "profile", section: "preferences" }}>
                <Icon name="languages" />
                {t("shell.userMenu.language")}
              </RouteLink>
            </DropdownMenuItem>
            <DocsMenuItem />
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}>
              <Icon name="log-out" />
              {t("auth.signOut.action")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
