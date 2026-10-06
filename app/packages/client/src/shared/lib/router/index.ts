// Public API of shared/lib/router (decision 0012).
export { ENTRY_ROUTE_IDS, nextRoute } from "./entry-routes.ts";
export { createMemoryRouter, type MemoryRouter } from "./memory-router.tsx";
export { parseRoute } from "./parse-route.ts";
export {
  PROFILE_SECTIONS,
  type ProfileSection,
  ROUTE_IDS,
  type Route,
  type RouteId,
  routeHref,
  SETTINGS_SECTIONS,
  type SettingsSection,
  WEB_ONLY_ROUTE_IDS,
} from "./route-paths.ts";
export { RouteLink, RouterProvider, useRouter } from "./router-context.tsx";
export type { RouterLinkProps, RouterPort } from "./router-port.ts";
export {
  type RouteSearch,
  searchOption,
  useCarriedSearch,
  useRouteSearch,
  useSettingsSearch,
} from "./use-route-search.ts";
