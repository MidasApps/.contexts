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

const parseOrganizationRoute = ([organizationId, ...rest]: string[], search: URLSearchParams): Route | null => {
  if (organizationId === undefined) return null;
  const [kind, second, third, fourth, ...more] = rest;
  if (kind === undefined) return { id: "organization", organizationId };
  if (kind === "settings" && second === undefined) return { id: "settings-index", organizationId };
  if (kind === "settings" && second === "m" && third !== undefined && fourth === undefined) {
    return { id: "settings-module", organizationId, moduleId: third };
  }
  if (kind === "settings" && isOneOf<SettingsSection>(SETTINGS_SECTIONS, second)) {
    if (third === undefined) return { id: "settings", organizationId, section: second };
    // Detail pages (an approval, a trace, a workflow run) live under their section.
    return isOneOf(SETTINGS_DETAIL_SECTIONS, second)
      ? { id: "settings", organizationId, section: second, rest: rest.slice(2).join("/") }
      : null;
  }
  if (kind !== "p" || second === undefined) return null;
  const unit = optional(search.get("unit"));
  if (third === undefined) return { id: "project", organizationId, projectId: second, unit };
  if (third === "chat")
    return more.length > 0 ? null : { id: "chat", organizationId, projectId: second, conversationId: fourth, unit };
  if (third !== "m" || fourth === undefined) return null;
  return { id: "module", organizationId, projectId: second, moduleId: fourth, rest: more.join("/"), unit };
};

/**
 * The route of an href (inverse of `routeHref`; locale already stripped), or `null` for a path
 * outside the route map (the app renders not-found). Unknown sections are `null` too.
 */
export const parseRoute = (href: string): Route | null => {
  const { segments, search, hash } = split(href);
  const [first, second, ...rest] = segments;
  if (first === undefined) return { id: "home" };
  if (first === "o") return second === undefined ? null : parseOrganizationRoute([second, ...rest], search);
  if (first === "admin") {
    const rest = segments.slice(1).join("/");
    return search.size === 0 ? { id: "admin", rest } : { id: "admin", rest, search: Object.fromEntries(search) };
  }
  if (second !== undefined && first === "profile" && rest.length === 0) {
    return isOneOf<ProfileSection>(PROFILE_SECTIONS, second) ? { id: "profile", section: second } : null;
  }
  if (second !== undefined) return null;
  if (first === "sign-in") return { id: "sign-in", next: optional(search.get("next")) };
  if (first === "invite") return { id: "invite", token: optional(hash.get("token")) };
  if (first === "sign-up") return { id: "sign-up", next: optional(search.get("next")) };
  if (first === "reset-password") return { id: "reset-password" };
  if (first === "organizations") return { id: "organizations" };
  return null;
};
