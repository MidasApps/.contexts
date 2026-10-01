"use client";

import { useTranslations } from "use-intl";
import { usePermissions } from "#/entities/permission/index.ts";
import { useCurrentNode, useMe } from "#/entities/session/index.ts";
import { useSignOut } from "#/features/sign-out/index.ts";
import { useSaveThemePreference } from "#/features/update-preferences/index.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { navItemRoute } from "#/shared/lib/shell/nav-item-route.ts";
import { useNavigationRegistry } from "#/shared/lib/shell/shell-registry-context.tsx";
import { THEME_PREFERENCES, type ThemePreference } from "#/shared/lib/theme/theme-provider.tsx";
import { Avatar } from "#/shared/ui/atoms/Avatar/Avatar.tsx";
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
        <DropdownMenuRadioGroup value={theme.preference} onValueChange={(value) => {
            const preference = THEME_PREFERENCES.find((candidate) => candidate === value);
            if (preference !== undefined) theme.save(preference);
          }}>
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

/**
 * User menu at the sidebar footer (sidebar-07 nav-user): who is signed in, the profile sections
 * from the `user-menu` navigation slot, theme (system/light/dark), language (profile preferences)
 * and sign out.
 */
export function UserMenu() {
  const t = useTranslations();
  const { isMobile } = useSidebar();
  const me = useMe();
  const node = useCurrentNode();
  const { can } = usePermissions();
  const items = useNavigationRegistry().visibleItems("user-menu", can);
  const { signOut } = useSignOut();
  const name = me.data === undefined ? "" : me.data.displayName.trim() === "" ? me.data.email : me.data.displayName;
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" tooltip={name} aria-label={t("shell.userMenu.trigger", { name })} className="data-[state=open]:bg-sidebar-accent">
              {me.data === undefined ? <Skeleton className="size-8 rounded-full" /> : <Avatar name={name} size="sm" decorative className="size-8" />}
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                {me.data === undefined ? (
                  <Skeleton className="h-4 w-28" />
                ) : (
                  <>
                    <span className="truncate text-[13px] font-medium">{name}</span>
                    <span className="truncate text-[11.5px] text-muted-foreground">{me.data.email}</span>
                  </>
                )}
              </span>
              <Icon name="chevron-down" className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "top" : "right"} align="end" sideOffset={4} className="min-w-60">
            <DropdownMenuLabel className="normal-case tracking-normal">
              <span className="block truncate text-[13px] font-medium text-foreground">{name}</span>
              {me.data === undefined ? null : <span className="block truncate font-sans text-xs text-muted-foreground">{me.data.email}</span>}
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
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <ThemeSubmenu />
            <DropdownMenuItem asChild>
              <RouteLink to={{ id: "profile", section: "preferences" }}>
                <Icon name="languages" />
                {t("shell.userMenu.language")}
              </RouteLink>
            </DropdownMenuItem>
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
