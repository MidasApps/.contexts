/**
 * Sections of an organization's administration, `/admin/o/:organizationId/:section` (SP2 spec §8; SP5
 * spec §7 for the agent runtime ones; decision 0077 moved them under `/admin`).
 */
export const SETTINGS_SECTIONS = [
  "general",
  "members",
  "invitations",
  "roles",
  "units",
  "audit-log",
  "api-keys",
  "devices",
  "agents",
  "skills",
  "knowledge",
  "connectors",
  "workflows",
  "usage",
  "traces",
  "evals",
  "flags",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/**
 * Sections with pages below them, addressed by the `rest` tail of the settings route:
 * `traces/{traceId}`, `workflows/runs/{runId}`.
 */
export const SETTINGS_DETAIL_SECTIONS = ["traces", "workflows"] as const satisfies readonly SettingsSection[];

/** Sections of `/admin/profile/:section` (SP2 spec §8; under `/admin` since decision 0077). */
export const PROFILE_SECTIONS = ["account", "preferences", "security", "sessions", "notifications"] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

/**
 * A place in the app (SP2 spec §4, decision 0012), without the web's `/{locale}` prefix, which
 * the web adapter adds. Two surfaces (decision 0077): the application at the root (organizations,
 * projects, chat, module pages, approvals) and the administration under `/admin` (organization
 * settings, module settings, profile and the platform console). `rest` is the catch-all tail of
 * module and admin routes ("" for the root), and the detail tail of a settings section (absent for
 * the section itself).
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
  | {
      id: "module";
      organizationId: string;
      projectId: string;
      moduleId: string;
      rest: string;
      unit?: string | undefined;
    }
  /** The chat of a project (SP4): a new conversation, or the stored one named in the path. */
  | {
      id: "chat";
      organizationId: string;
      projectId: string;
      conversationId?: string | undefined;
      unit?: string | undefined;
    }
  /**
   * The organization's approvals inbox (SP5 spec §3.4): deciding an agent's action is part of using
   * the app, so it lives in the application; `approvalRequestId` opens one request.
   */
  | {
      id: "approvals";
      organizationId: string;
      approvalRequestId?: string | undefined;
      search?: Readonly<Record<string, string>> | undefined;
    }
  | {
      id: "settings";
      organizationId: string;
      section: SettingsSection;
      rest?: string | undefined;
      search?: Readonly<Record<string, string>> | undefined;
    }
  /** `/admin/o/:organizationId` without a section: opens the first section the viewer can read. */
  | { id: "settings-index"; organizationId: string }
  | { id: "settings-module"; organizationId: string; moduleId: string }
  | { id: "profile"; section: ProfileSection }
  /** `/admin`: opens the administration of the last organization used (or the platform console for staff). */
  | { id: "admin-home" }
  /** The platform console (staff only): `/admin/platform/<area>…`. */
  | { id: "admin"; rest: string; search?: Readonly<Record<string, string>> | undefined }
  /** The user guide (decision 0073): `page` is the slug of one guide page, "" for its index. Readable signed out. */
  | { id: "docs"; page: string };

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
  "approvals",
  "settings",
  "settings-index",
  "settings-module",
  "profile",
  "admin-home",
  "admin",
  "docs",
] as const satisfies readonly RouteId[];

/**
 * Routes that exist only on web: the platform console (decision 0012) and the guide (decision 0073).
 * The desktop keeps the organization's administration and the profile (decision 0077).
 */
export const WEB_ONLY_ROUTE_IDS: readonly RouteId[] = ["admin", "docs"];

/** Routes of the administration surface (`/admin`, decision 0077); every other signed-in route is the application. */
export const ADMIN_SURFACE_ROUTE_IDS: ReadonlySet<RouteId> = new Set<RouteId>([
  "settings",
  "settings-index",
  "settings-module",
  "profile",
  "admin-home",
  "admin",
]);

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
const organizationAdminPath = (organizationId: string): string => `/admin/o/${seg(organizationId)}`;

type OrganizationRoute = Extract<Route, { organizationId: string }>;

/** Routes of one organization: the application's `/o/:organizationId/…`, the administration's `/admin/o/:organizationId/…`. */
const organizationRouteHref = (route: OrganizationRoute): string => {
  const organization = organizationPath(route.organizationId);
  const administration = organizationAdminPath(route.organizationId);
  switch (route.id) {
    case "organization":
      return organization;
    case "project":
      return withSearch(`${organization}/p/${seg(route.projectId)}`, { unit: route.unit });
    case "module": {
      const base = `${organization}/p/${seg(route.projectId)}/m/${seg(route.moduleId)}${tail(route.rest)}`;
      return withSearch(base, { unit: route.unit });
    }
    case "chat": {
      const conversation = route.conversationId === undefined ? "" : `/${seg(route.conversationId)}`;
      return withSearch(`${organization}/p/${seg(route.projectId)}/chat${conversation}`, { unit: route.unit });
    }
    case "approvals": {
      const request = route.approvalRequestId === undefined ? "" : `/${seg(route.approvalRequestId)}`;
      return withSearch(`${organization}/approvals${request}`, route.search ?? {});
    }
    case "settings":
      return withSearch(`${administration}/${route.section}${tail(route.rest ?? "")}`, route.search ?? {});
    case "settings-index":
      return administration;
    case "settings-module":
      return `${administration}/m/${seg(route.moduleId)}`;
  }
};

/**
 * The href of a route (path + search + hash), e.g. `{ id: "project", organizationId: "a",
 * projectId: "b", unit: "c" }` → `/o/a/p/b?unit=c`. Segments are URI-encoded.
 */
export const routeHref = (route: Route): string => {
  if ("organizationId" in route) return organizationRouteHref(route);
  switch (route.id) {
    case "sign-in":
      return withSearch("/sign-in", { next: route.next });
    case "invite":
      return route.token === undefined
        ? "/invite"
        : `/invite#${new URLSearchParams({ token: route.token }).toString()}`;
    case "sign-up":
      return withSearch("/sign-up", { next: route.next });
    case "reset-password":
      return "/reset-password";
    case "home":
      return "/";
    case "organizations":
      return "/organizations";
    case "profile":
      return `/admin/profile/${route.section}`;
    case "admin-home":
      return "/admin";
    case "admin":
      return withSearch(`/admin/platform${tail(route.rest)}`, route.search ?? {});
    case "docs":
      return route.page === "" ? "/docs" : `/docs/${seg(route.page)}`;
  }
};
