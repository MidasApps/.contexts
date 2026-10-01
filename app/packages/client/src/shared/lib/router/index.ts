// Public API of shared/lib/router (decision 0012).
export { createMemoryRouter, type MemoryRouter } from "./memory-router.tsx";
export { parseRoute } from "./parse-route.ts";
export {
  PROFILE_SECTIONS,
  ROUTE_IDS,
  routeHref,
  SETTINGS_SECTIONS,
  WEB_ONLY_ROUTE_IDS,
  type ProfileSection,
  type Route,
  type RouteId,
  type SettingsSection,
} from "./route-paths.ts";
export { RouteLink, RouterProvider, useRouter } from "./router-context.tsx";
export type { RouterLinkProps, RouterPort } from "./router-port.ts";
