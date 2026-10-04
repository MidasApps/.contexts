import { ROUTE_IDS, type Route, type RouteId, routeHref, WEB_ONLY_ROUTE_IDS } from "@core/client/shared/lib/router";
import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { createAppRouter } from "@/router.ts";
import type { DesktopApp } from "@/router-context.ts";

/** One sample route per id of the shared route map (decision 0012). */
const SAMPLES: Record<RouteId, readonly Route[]> = {
  "sign-in": [{ id: "sign-in", next: "/o/org-1" }],
  invite: [{ id: "invite", token: "t" }],
  "sign-up": [{ id: "sign-up", next: "/organizations" }],
  "reset-password": [{ id: "reset-password" }],
  home: [{ id: "home" }],
  organizations: [{ id: "organizations" }],
  organization: [{ id: "organization", organizationId: "org-1" }],
  project: [{ id: "project", organizationId: "org-1", projectId: "p-1", unit: "u-1" }],
  module: [
    { id: "module", organizationId: "org-1", projectId: "p-1", moduleId: "example", rest: "" },
    { id: "module", organizationId: "org-1", projectId: "p-1", moduleId: "example", rest: "items/42" },
  ],
  chat: [
    { id: "chat", organizationId: "org-1", projectId: "p-1" },
    { id: "chat", organizationId: "org-1", projectId: "p-1", conversationId: "Cv3xZ5aB7nM9qW1eR2tY" },
  ],
  settings: [
    { id: "settings", organizationId: "org-1", section: "members" },
    { id: "settings", organizationId: "org-1", section: "approvals", rest: "ap-1" },
    { id: "settings", organizationId: "org-1", section: "workflows", rest: "runs/run-1" },
  ],
  "settings-index": [{ id: "settings-index", organizationId: "org-1" }],
  "settings-module": [{ id: "settings-module", organizationId: "org-1", moduleId: "example" }],
  profile: [{ id: "profile", section: "security" }],
  admin: [{ id: "admin", rest: "" }],
};

/** The desktop file route that must serve each route id. */
const DESKTOP_ROUTE: Record<Exclude<RouteId, "admin">, string> = {
  "sign-in": "/sign-in",
  invite: "/invite",
  "sign-up": "/sign-up",
  "reset-password": "/reset-password",
  home: "/",
  organizations: "/organizations",
  organization: "/o/$organizationId/",
  project: "/o/$organizationId/p/$projectId/",
  module: "/o/$organizationId/p/$projectId/m/$moduleId/$",
  chat: "/o/$organizationId/p/$projectId/chat/{-$conversationId}",
  settings: "/o/$organizationId/settings/$section/$",
  "settings-index": "/o/$organizationId/settings/",
  "settings-module": "/o/$organizationId/settings/m/$moduleId",
  profile: "/profile/$section",
};

// Matching only: no component renders, so the app in the context is never read.
const UNUSED_APP = {} as DesktopApp;

const matchHref = async (href: string) => {
  const router = createAppRouter({ app: UNUSED_APP, history: createMemoryHistory({ initialEntries: [href] }) });
  await router.load();
  const leaf = router.state.matches.at(-1);
  // A path outside every file route matches the root alone, which renders its notFoundComponent.
  return { routeId: leaf?.routeId, notFound: leaf?.routeId === "__root__" };
};

describe("desktop route tree", () => {
  it.each(
    ROUTE_IDS.filter((id) => !WEB_ONLY_ROUTE_IDS.includes(id)).flatMap((id) =>
      SAMPLES[id].map((route) => [id, routeHref(route)] as const),
    ),
  )("serves %s at %s", async (id, href) => {
    const match = await matchHref(href);

    expect(match).toEqual({ routeId: DESKTOP_ROUTE[id as Exclude<RouteId, "admin">], notFound: false });
  });

  it("has no /admin surface: the web-only routes are not found on desktop", async () => {
    for (const id of WEB_ONLY_ROUTE_IDS) {
      for (const route of SAMPLES[id]) expect((await matchHref(routeHref(route))).notFound).toBe(true);
    }
  });
});
