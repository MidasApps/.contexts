"use client";

import { type PermissionsState, usePlatformPermissions } from "#/entities/permission/index.ts";
import type { Route } from "#/shared/lib/router/route-paths.ts";
import { navItemRoute } from "#/shared/lib/shell/nav-item-route.ts";
import { useNavigationRegistry } from "#/shared/lib/shell/shell-registry-context.tsx";
import type { ShellNavItem } from "#/shared/lib/shell/shell-types.ts";

export type AdminItem = { readonly item: ShellNavItem; readonly route: Route };

/**
 * The `admin` navigation slot (core areas of SP2 spec §7, SP5 pages and module admin items) the
 * staff role may open, with their routes, plus the permission state for loading/error UI.
 */
export const useAdminItems = (): { readonly items: readonly AdminItem[]; readonly permissions: PermissionsState } => {
  const permissions = usePlatformPermissions();
  const items = useNavigationRegistry()
    .visibleItems("admin", permissions.can)
    .flatMap((item) => {
      const route = navItemRoute(item.target, {});
      return route === null ? [] : [{ item, route }];
    });
  return { items, permissions };
};

/** Whether the admin area `rest` is the current page or contains it (`/admin/users/42` → `users`). */
export const isAdminAreaActive = (route: Route, locationPath: string): boolean => {
  if (route.id !== "admin") return false;
  const base = route.rest === "" ? "/admin" : `/admin/${route.rest}`;
  return locationPath === base || (route.rest !== "" && locationPath.startsWith(`${base}/`));
};
