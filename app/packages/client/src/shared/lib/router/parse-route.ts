import {
  PROFILE_SECTIONS,
  type ProfileSection,
  type Route,
  SETTINGS_DETAIL_SECTIONS,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "./route-paths.ts";

const isOneOf = <T extends string>(values: readonly T[], value: string | undefined): value is T =>
  value !== undefined && (values as readonly string[]).includes(value);

const optional = (value: string | null): string | undefined => value ?? undefined;

type Parts = { segments: string[]; search: URLSearchParams; hash: URLSearchParams };

const split = (href: string): Parts => {
  const url = new URL(href, "http://route.invalid");
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  return { segments, search: url.searchParams, hash: new URLSearchParams(url.hash.slice(1)) };
};

/** `/o/:organizationId/settings/…`: the index, a module's settings, a section or a section's detail page. */
const parseSettingsRoute = (organizationId: string, segments: string[]): Route | null => {
  const [section, detail, extra] = segments;
  if (section === undefined) return { id: "settings-index", organizationId };
  if (section === "m" && detail !== undefined && extra === undefined) {
    return { id: "settings-module", organizationId, moduleId: detail };
  }
  if (!isOneOf<SettingsSection>(SETTINGS_SECTIONS, section)) return null;
  if (detail === undefined) return { id: "settings", organizationId, section };
  // Detail pages (an approval, a trace, a workflow run) live under their section.
  return isOneOf(SETTINGS_DETAIL_SECTIONS, section)
    ? { id: "settings", organizationId, section, rest: segments.slice(1).join("/") }
    : null;
};

/** `/o/:organizationId/p/:projectId/…`: the project, its chat or one of its modules. */
const parseProjectRoute = (organizationId: string, segments: string[], search: URLSearchParams): Route | null => {
  const [projectId, kind, id, ...more] = segments;
  if (projectId === undefined) return null;
  const unit = optional(search.get("unit"));
  if (kind === undefined) return { id: "project", organizationId, projectId, unit };
  if (kind === "chat")
    return more.length > 0 ? null : { id: "chat", organizationId, projectId, conversationId: id, unit };
  if (kind !== "m" || id === undefined) return null;
  return { id: "module", organizationId, projectId, moduleId: id, rest: more.join("/"), unit };
};

const parseOrganizationRoute = ([organizationId, kind, ...rest]: string[], search: URLSearchParams): Route | null => {
  if (organizationId === undefined) return null;
  if (kind === undefined) return { id: "organization", organizationId };
  if (kind === "settings") return parseSettingsRoute(organizationId, rest);
  if (kind === "p") return parseProjectRoute(organizationId, rest, search);
  return null;
};

/** Pages addressed by one segment. A `Map`, so a segment like `constructor` finds nothing. */
const PAGE_ROUTES = new Map<string, (parts: Parts) => Route>([
  ["sign-in", ({ search }) => ({ id: "sign-in", next: optional(search.get("next")) })],
  ["invite", ({ hash }) => ({ id: "invite", token: optional(hash.get("token")) })],
  ["sign-up", ({ search }) => ({ id: "sign-up", next: optional(search.get("next")) })],
  ["reset-password", () => ({ id: "reset-password" })],
  ["organizations", () => ({ id: "organizations" })],
]);

/**
 * The route of an href (inverse of `routeHref`; locale already stripped), or `null` for a path
 * outside the route map (the app renders not-found). Unknown sections are `null` too.
 */
export const parseRoute = (href: string): Route | null => {
  const parts = split(href);
  const { segments, search } = parts;
  const [first, second, ...rest] = segments;
  if (first === undefined) return { id: "home" };
  if (first === "o") return parseOrganizationRoute(segments.slice(1), search);
  if (first === "admin") {
    const tail = segments.slice(1).join("/");
    return search.size === 0
      ? { id: "admin", rest: tail }
      : { id: "admin", rest: tail, search: Object.fromEntries(search) };
  }
  if (first === "profile") {
    return rest.length === 0 && isOneOf<ProfileSection>(PROFILE_SECTIONS, second)
      ? { id: "profile", section: second }
      : null;
  }
  if (second !== undefined) return null;
  return PAGE_ROUTES.get(first)?.(parts) ?? null;
};
