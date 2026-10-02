import { describe, expect, it } from "vitest";
import { parseRoute } from "./parse-route.ts";
import { ROUTE_IDS, routeHref, type Route, type RouteId } from "./route-paths.ts";

/** One or more sample routes per id, including awkward characters. */
const SAMPLES: Record<RouteId, Route[]> = {
  "sign-in": [{ id: "sign-in", next: undefined }, { id: "sign-in", next: "/o/a b/p/c?unit=d" }],
  invite: [{ id: "invite", token: undefined }, { id: "invite", token: "tok+/=en" }],
  "sign-up": [{ id: "sign-up", next: undefined }, { id: "sign-up", next: "/organizations" }],
  "reset-password": [{ id: "reset-password" }],
  home: [{ id: "home" }],
  organizations: [{ id: "organizations" }],
  organization: [{ id: "organization", organizationId: "Xk2mQ9vLr3TnB7pWc1aZ" }],
  project: [
    { id: "project", organizationId: "org", projectId: "p 1", unit: undefined },
    { id: "project", organizationId: "org", projectId: "p1", unit: "unit/7" },
  ],
  module: [
    { id: "module", organizationId: "org", projectId: "p1", moduleId: "example", rest: "", unit: undefined },
    { id: "module", organizationId: "org", projectId: "p1", moduleId: "example", rest: "items/a%b", unit: "u1" },
  ],
  chat: [
    { id: "chat", organizationId: "org", projectId: "p1", conversationId: undefined, unit: undefined },
    { id: "chat", organizationId: "org", projectId: "p 1", conversationId: "Cv3xZ5aB7nM9qW1eR2tY", unit: "u1" },
  ],
  settings: [
    { id: "settings", organizationId: "org", section: "members" },
    { id: "settings", organizationId: "org", section: "api-keys" },
    { id: "settings", organizationId: "org", section: "approvals", rest: "Ap3rQ9vLr3TnB7pWc1aZ" },
    { id: "settings", organizationId: "org", section: "workflows", rest: "runs/run 1" },
  ],
  "settings-module": [{ id: "settings-module", organizationId: "org", moduleId: "example" }],
  profile: [{ id: "profile", section: "preferences" }],
  admin: [
    { id: "admin", rest: "" },
    { id: "admin", rest: "organizations/org-1" },
    { id: "admin", rest: "traces", search: { status: "error", organizationId: "org 1", page: "2" } },
  ],
};

describe("route paths", () => {
  it.each(ROUTE_IDS)("round-trips %s through routeHref and parseRoute", (id) => {
    for (const route of SAMPLES[id]) expect(parseRoute(routeHref(route))).toEqual(route);
  });

  it("builds the SP2 spec §4 paths", () => {
    expect(routeHref({ id: "project", organizationId: "a", projectId: "b", unit: "c" })).toBe("/o/a/p/b?unit=c");
    expect(routeHref({ id: "module", organizationId: "a", projectId: "b", moduleId: "example", rest: "items/1" })).toBe("/o/a/p/b/m/example/items/1");
    expect(routeHref({ id: "settings-module", organizationId: "a", moduleId: "example" })).toBe("/o/a/settings/m/example");
    expect(routeHref({ id: "settings", organizationId: "a", section: "approvals", rest: "ap1" })).toBe("/o/a/settings/approvals/ap1");
    expect(routeHref({ id: "settings", organizationId: "a", section: "workflows", rest: "runs/r1" })).toBe("/o/a/settings/workflows/runs/r1");
    expect(routeHref({ id: "chat", organizationId: "a", projectId: "b" })).toBe("/o/a/p/b/chat");
    expect(routeHref({ id: "chat", organizationId: "a", projectId: "b", conversationId: "c1" })).toBe("/o/a/p/b/chat/c1");
    expect(routeHref({ id: "sign-in", next: "/organizations" })).toBe("/sign-in?next=%2Forganizations");
    expect(routeHref({ id: "invite", token: "t1" })).toBe("/invite#token=t1");
    expect(routeHref({ id: "sign-up", next: "/organizations" })).toBe("/sign-up?next=%2Forganizations");
    expect(routeHref({ id: "reset-password" })).toBe("/reset-password");
    expect(routeHref({ id: "admin", rest: "" })).toBe("/admin");
    expect(routeHref({ id: "admin", rest: "traces", search: { status: "error" } })).toBe("/admin/traces?status=error");
    expect(routeHref({ id: "admin", rest: "traces", search: {} })).toBe("/admin/traces");
  });

  it("returns null for paths outside the map and unknown sections", () => {
    expect(parseRoute("/nope")).toBeNull();
    expect(parseRoute("/o")).toBeNull();
    expect(parseRoute("/o/a/settings/billing")).toBeNull();
    expect(parseRoute("/o/a/settings/members/extra")).toBeNull();
    expect(parseRoute("/profile/unknown")).toBeNull();
    expect(parseRoute("/o/a/p/b/x")).toBeNull();
    expect(parseRoute("/o/a/p/b/chat/c1/extra")).toBeNull();
  });
});
