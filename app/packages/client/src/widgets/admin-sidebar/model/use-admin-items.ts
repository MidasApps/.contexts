"use client";

import { type PermissionsState, usePermissions, usePlatformPermissions } from "#/entities/permission/index.ts";
import { parseRoute } from "#/shared/lib/router/parse-route.ts";
import { type Route, routeHref } from "#/shared/lib/router/route-paths.ts";
import { navItemRoute } from "#/shared/lib/shell/nav-item-route.ts";
import { useNavigationRegistry } from "#/shared/lib/shell/shell-registry-context.tsx";
import type { ShellNavItem } from "#/shared/lib/shell/shell-types.ts";

export type AdminItem = { readonly item: ShellNavItem; readonly route: Route };

/**
 * The part of the administration a path is in (decision 0077): an organization's settings, the
 * user's own account (profile) or the platform console. The sidebar lists the sections of that part.
 */
export type AdminContext = "organization" | "account" | "platform";

export const adminContextOf = (locationPath: string): AdminContext => {
  const route = parseRoute(locationPath);
  if (route?.id === "admin") return "platform";
  if (route?.id === "profile") return "account";
  return "organization";
};

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

/**
 * The `settings` navigation slot (core sections and one entry per module with settings) the viewer
 * may read in the organization, filtered by `can()` there, plus the permission state.
 */
export const useOrganizationAdminItems = (
  organizationId: string,
): { readonly items: readonly AdminItem[]; readonly permissions: PermissionsState } => {
  const permissions = usePermissions({ organizationId });
  const items = useNavigationRegistry()
    .visibleItems("settings", permissions.can)
    .flatMap((item) => {
      const route = navItemRoute(item.target, { organizationId });
      return route === null ? [] : [{ item, route }];
    });
  return { items, permissions };
};

/** The profile sections of the `user-menu` slot: the same source the user menu reads. */
export const useAccountItems = (): readonly AdminItem[] => {
  const { can } = usePermissions();
  return useNavigationRegistry()
    .visibleItems("user-menu", can)
    .flatMap((item): AdminItem[] =>
      item.target.kind === "profile" ? [{ item, route: { id: "profile", section: item.target.section } }] : [],
    );
};

const pathOf = (route: Route): string => routeHref(route).split(/[?#]/u)[0] ?? "";

/**
 * Whether a section is the current page or contains it: a settings section stays current on its
 * detail pages (`workflows/runs/{id}`), a platform area on its sub-pages (`/admin/platform/users/42`).
 * The platform console's home only matches itself.
 */
export const isAdminAreaActive = (route: Route, locationPath: string): boolean => {
  const base = pathOf(route);
  if (route.id === "admin" && route.rest === "") return locationPath === base;
  return locationPath === base || locationPath.startsWith(`${base}/`);
};
