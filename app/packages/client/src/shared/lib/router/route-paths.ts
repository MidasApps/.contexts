/** Sections of `/o/:organizationId/settings/:section` (SP2 spec §8; SP5 spec §7 for the agent runtime ones). */
export const SETTINGS_SECTIONS = [
  "general",
  "members",
  "invitations",
  "roles",
  "units",
  "api-keys",
  "devices",
  "agents",
  "skills",
  "knowledge",
  "connectors",
  "workflows",
  "approvals",
  "usage",
  "traces",
  "evals",
  "flags",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/**
 * Sections with pages below them, addressed by the `rest` tail of the settings route:
 * `approvals/{approvalRequestId}`, `traces/{traceId}`, `workflows/runs/{runId}`.
 */
export const SETTINGS_DETAIL_SECTIONS = ["approvals", "traces", "workflows"] as const satisfies readonly SettingsSection[];

/** Sections of `/profile/:section` (SP2 spec §8). */
export const PROFILE_SECTIONS = ["account", "preferences", "security", "sessions", "notifications"] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

/**
 * A place in the app (SP2 spec §4, decision 0012), without the web's `/{locale}` prefix, which
 * the web adapter adds. `rest` is the catch-all tail of module and admin routes ("" for the root),
 * and the detail tail of a settings section (absent for the section itself).
 * Admin pages and settings sections keep their tabs, filters and page in `search` (SP5: filters
 * are shareable links); views read and write them with `useRouteSearch`.
 */
export type Route =
  | { id: "sign-in"; next?: string | undefined }
  | { id: "invite"; token?: string | undefined }
  /** Open sign-up (decision 0050); `next` as on sign-in. */
  | { id: "sign-up"; next?: string | undefined }
  /** Password reset request (the email is typed there; never carried in the URL). */
  | { id: "reset-password" }
  | { id: "home" }
  | { id: "organizations" }
  | { id: "organization"; organizationId: string }
  | { id: "project"; organizationId: string; projectId: string; unit?: string | undefined }
  | { id: "module"; organizationId: string; projectId: string; moduleId: string; rest: string; unit?: string | undefined }
  /** The chat of a project (SP4): a new conversation, or the stored one named in the path. */
  | { id: "chat"; organizationId: string; projectId: string; conversationId?: string | undefined; unit?: string | undefined }
  | { id: "settings"; organizationId: string; section: SettingsSection; rest?: string | undefined; search?: Readonly<Record<string, string>> | undefined }
  /** `/o/:organizationId/settings` without a section: opens the first section the viewer can read. */
  | { id: "settings-index"; organizationId: string }
  | { id: "settings-module"; organizationId: string; moduleId: string }
  | { id: "profile"; section: ProfileSection }
  | { id: "admin"; rest: string; search?: Readonly<Record<string, string>> | undefined };

export type RouteId = Route["id"];

export const ROUTE_IDS = [
  "sign-in",
  "invite",
  "sign-up",
  "reset-password",
  "home",
  "organizations",
  "organization",
  "project",
  "module",
  "chat",
  "settings",
  "settings-index",
  "settings-module",
  "profile",
  "admin",
] as const satisfies readonly RouteId[];

/** Routes that exist only on web (the desktop has no `/admin`, decision 0012). */
export const WEB_ONLY_ROUTE_IDS: readonly RouteId[] = ["admin"];

const seg = (value: string): string => encodeURIComponent(value);

/** `a/b` tail: each segment encoded, slashes kept. */
const tail = (rest: string): string => (rest === "" ? "" : `/${rest.split("/").map(seg).join("/")}`);

const withSearch = (path: string, search: Record<string, string | undefined>): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) if (value !== undefined) params.set(key, value);
  const text = params.toString();
  return text === "" ? path : `${path}?${text}`;
};

const organizationPath = (organizationId: string): string => `/o/${seg(organizationId)}`;

/**
 * The href of a route (path + search + hash), e.g. `{ id: "project", organizationId: "a",
 * projectId: "b", unit: "c" }` → `/o/a/p/b?unit=c`. Segments are URI-encoded.
 */
export const routeHref = (route: Route): string => {
  switch (route.id) {
    case "sign-in":
      return withSearch("/sign-in", { next: route.next });
    case "invite":
      return route.token === undefined ? "/invite" : `/invite#${new URLSearchParams({ token: route.token }).toString()}`;
    case "sign-up":
      return withSearch("/sign-up", { next: route.next });
    case "reset-password":
      return "/reset-password";
    case "home":
      return "/";
    case "organizations":
      return "/organizations";
    case "organization":
      return organizationPath(route.organizationId);
    case "project":
      return withSearch(`${organizationPath(route.organizationId)}/p/${seg(route.projectId)}`, { unit: route.unit });
    case "module": {
      const base = `${organizationPath(route.organizationId)}/p/${seg(route.projectId)}/m/${seg(route.moduleId)}${tail(route.rest)}`;
      return withSearch(base, { unit: route.unit });
    }
    case "chat": {
      const base = `${organizationPath(route.organizationId)}/p/${seg(route.projectId)}/chat${route.conversationId === undefined ? "" : `/${seg(route.conversationId)}`}`;
      return withSearch(base, { unit: route.unit });
    }
    case "settings":
      return withSearch(`${organizationPath(route.organizationId)}/settings/${route.section}${tail(route.rest ?? "")}`, route.search ?? {});
    case "settings-index":
      return `${organizationPath(route.organizationId)}/settings`;
    case "settings-module":
      return `${organizationPath(route.organizationId)}/settings/m/${seg(route.moduleId)}`;
    case "profile":
      return `/profile/${route.section}`;
    case "admin":
      return withSearch(`/admin${tail(route.rest)}`, route.search ?? {});
  }
};
