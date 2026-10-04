import { describe, expect, it } from "vitest";
import { PROFILE_SECTIONS, SETTINGS_SECTIONS } from "#/shared/lib/router/route-paths.ts";
import { navItemRoute } from "#/shared/lib/shell/nav-item-route.ts";
import { CORE_NAVIGATION } from "./core-navigation.ts";
import { createNavigationRegistry, NavigationRegistryError, type ShellNavItem } from "./navigation-registry.ts";

const item = (overrides: Partial<ShellNavItem> & Pick<ShellNavItem, "id">): ShellNavItem => ({
  slot: "project",
  labelKey: "shell.nav.projectHome",
  icon: "layers",
  order: 50,
  target: { kind: "project-home" },
  ...overrides,
});

describe("navigation registry", () => {
  it("filters items by permission with the given can()", () => {
    const registry = createNavigationRegistry([
      item({ id: "open" }),
      item({ id: "gated", permission: "sample.item.read" }),
      item({ id: "denied", permission: "sample.item.write" }),
    ]);
    const can = (permission: string) => permission === "sample.item.read";
    expect(registry.visibleItems("project", can).map((entry) => entry.id)).toEqual(["gated", "open"]);
  });

  it("orders by order, then by id, and keeps slots apart", () => {
    const registry = createNavigationRegistry([
      item({ id: "b", order: 10 }),
      item({ id: "a", order: 10 }),
      item({ id: "first", order: 0 }),
      item({ id: "elsewhere", slot: "settings", target: { kind: "settings", section: "general" } }),
    ]);
    expect(registry.visibleItems("project", () => true).map((entry) => entry.id)).toEqual(["first", "a", "b"]);
    expect(registry.visibleItems("settings", () => true).map((entry) => entry.id)).toEqual(["elsewhere"]);
    expect(registry.visibleItems("admin", () => true)).toEqual([]);
  });

  it("rejects duplicate item ids (a core item and a module item cannot collide)", () => {
    expect(() => createNavigationRegistry([item({ id: "x" }), item({ id: "x" })])).toThrow(NavigationRegistryError);
  });
});

describe("core navigation", () => {
  const registry = createNavigationRegistry(CORE_NAVIGATION);
  const all = () => true;

  it("lists every settings section, gated by its read permission", () => {
    const settings = registry.visibleItems("settings", all);
    expect(settings.map((entry) => entry.target)).toEqual(
      SETTINGS_SECTIONS.map((section) => ({ kind: "settings", section })),
    );
    expect(settings.every((entry) => entry.permission !== undefined)).toBe(true);
    expect(
      registry.visibleItems("settings", (permission) => permission === "core.member.read").map((entry) => entry.id),
    ).toEqual(["core.settings.members"]);
  });

  it("lists every profile section in the user menu without a permission", () => {
    const profile = registry.visibleItems("user-menu", () => false);
    expect(profile.map((entry) => entry.target)).toEqual(
      PROFILE_SECTIONS.map((section) => ({ kind: "profile", section })),
    );
  });

  it("lists the admin areas of SP5 spec §6, each gated by its platform permission, and the organization and project homes", () => {
    expect(registry.visibleItems("admin", all).map((entry) => [entry.id, entry.permission])).toEqual([
      ["core.admin.organizations", "platform.organization.read"],
      ["core.admin.plans", "platform.plan.manage"],
      ["core.admin.users", "platform.user.read"],
      ["core.admin.agents", "platform.agent.manage"],
      ["core.admin.evals", "platform.eval.manage"],
      ["core.admin.traces", "platform.trace.read"],
      ["core.admin.logs", "platform.trace.read"],
      ["core.admin.costs", "platform.usage.read"],
      ["core.admin.workflows", "platform.workflow.manage"],
      ["core.admin.flags", "platform.flag.manage"],
      ["core.admin.connectors", "platform.connector.read"],
    ]);
    // Grouped by what staff come to do (decision 0055).
    expect(registry.visibleItems("admin", all).map((entry) => entry.group)).toEqual([
      "customers",
      "customers",
      "customers",
      "ai",
      "ai",
      "ai",
      "ai",
      "ai",
      "operations",
      "operations",
      "operations",
    ]);
    expect(registry.visibleItems("organization", all).map((entry) => entry.id)).toEqual([
      "core.organization.home",
      "core.organization.settings",
    ]);
    expect(registry.visibleItems("project", all).map((entry) => entry.id)).toEqual([
      "core.project.home",
      "core.project.chat",
    ]);
    // The chat entry is for members who may chat (SP4 Task 13).
    expect(
      registry
        .visibleItems("project", (permission) => permission !== "core.conversation.send")
        .map((entry) => entry.id),
    ).toEqual(["core.project.home"]);
  });
});

describe("navItemRoute", () => {
  const context = { organizationId: "o1", projectId: "p1", unitId: "u1" };

  it("builds the route of each target in the current context", () => {
    expect(navItemRoute({ kind: "module", moduleId: "sample", path: "items" }, context)).toEqual({
      id: "module",
      organizationId: "o1",
      projectId: "p1",
      moduleId: "sample",
      rest: "items",
      unit: "u1",
    });
    expect(navItemRoute({ kind: "settings-module", moduleId: "sample" }, context)).toEqual({
      id: "settings-module",
      organizationId: "o1",
      moduleId: "sample",
    });
    expect(navItemRoute({ kind: "settings", section: "roles" }, context)).toEqual({
      id: "settings",
      organizationId: "o1",
      section: "roles",
    });
    expect(navItemRoute({ kind: "profile", section: "security" }, {})).toEqual({ id: "profile", section: "security" });
    expect(navItemRoute({ kind: "admin", rest: "users" }, {})).toEqual({ id: "admin", rest: "users" });
    expect(navItemRoute({ kind: "organization-home" }, context)).toEqual({ id: "organization", organizationId: "o1" });
    expect(navItemRoute({ kind: "project-home" }, context)).toEqual({
      id: "project",
      organizationId: "o1",
      projectId: "p1",
      unit: "u1",
    });
    expect(navItemRoute({ kind: "chat" }, context)).toEqual({
      id: "chat",
      organizationId: "o1",
      projectId: "p1",
      unit: "u1",
    });
  });

  it("returns null when the context lacks the organization or project the target needs", () => {
    expect(navItemRoute({ kind: "module", moduleId: "sample", path: "" }, { organizationId: "o1" })).toBeNull();
    expect(navItemRoute({ kind: "settings", section: "roles" }, {})).toBeNull();
    expect(navItemRoute({ kind: "project-home" }, { organizationId: "o1" })).toBeNull();
    expect(navItemRoute({ kind: "chat" }, { organizationId: "o1" })).toBeNull();
  });
});
