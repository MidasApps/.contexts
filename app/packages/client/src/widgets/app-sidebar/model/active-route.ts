import { type Route, routeHref } from "#/shared/lib/router/route-paths.ts";

const pathOf = (route: Route): string => routeHref(route).split(/[?#]/u)[0] ?? "";

/**
 * Whether a navigation item's route is the current page: same path (search ignored, so `?unit=`
 * does not matter), or any page inside it for sections with sub-pages (settings, module pages,
 * the conversations of the chat).
 */
export const isRouteActive = (route: Route, locationPath: string): boolean => {
  const target = pathOf(route);
  if (locationPath === target) return true;
  if (route.id === "settings") return locationPath.startsWith(`${target.slice(0, target.lastIndexOf("/"))}/`);
  if (route.id === "module" || route.id === "chat") return locationPath.startsWith(`${target}/`);
  return false;
};
