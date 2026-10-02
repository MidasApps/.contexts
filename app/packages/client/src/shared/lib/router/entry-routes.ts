import { parseRoute } from "./parse-route.ts";
import type { Route, RouteId } from "./route-paths.ts";

/**
 * Signed-out entry pages: they frame themselves (`AuthTemplate`), handle their own session states
 * and are never a destination after signing in. Hosts render them outside the user-area shell.
 */
export const ENTRY_ROUTE_IDS: ReadonlySet<RouteId> = new Set<RouteId>(["sign-in", "invite", "sign-up", "reset-password"]);

const HOME: Route = { id: "home" };

/**
 * Where to go after signing in: `?next=` when it is a route of the app (never another origin:
 * `parseRoute` only yields internal routes) and not an entry page, else home.
 */
export const nextRoute = (next: string | null): Route => {
  if (next === null || !next.startsWith("/") || next.startsWith("//")) return HOME;
  const route = parseRoute(next);
  return route === null || ENTRY_ROUTE_IDS.has(route.id) ? HOME : route;
};
