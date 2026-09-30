import type { NodeRef, Principal } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { createAccessWorld, nodes, principals } from "./access-world.fixture.ts";
import { makeGetEffectivePermissions } from "./get-effective-permissions.ts";

const { user, service, impersonated, device } = principals;

const effective = async (principal: Principal, node: NodeRef, ceiling?: ReadonlySet<string>) => {
  const world = createAccessWorld();
  const result = await makeGetEffectivePermissions({ registry: world.registry, readers: world.store, clock: world.clock })({ principal, node, ceiling });
  return result.ok ? [...result.permissions].sort() : result.reason;
};

describe("getEffectivePermissions", () => {
  it("returns every tenant permission of an owner, module ones included, sorted", async () => {
    const world = createAccessWorld();
    const tenantIds = world.registry.listTenantPermissions().map((permission) => permission.id);
    expect(await effective(user("owner-a"), nodes.unit("u1a"))).toEqual([...tenantIds].sort());
  });

  it("returns what inherited grants give at a node", async () => {
    expect(await effective(user("viewer-p1"), nodes.unit("u1a-i"))).toEqual(["core.organization.read", "core.project.read", "core.unit.read"]);
    expect(await effective(device("dev-1"), nodes.p1)).toEqual(["core.project.read"]);
  });

  it("limits an impersonated user to read permissions", async () => {
    const { registry } = createAccessWorld();
    const permissions = await effective(impersonated("owner-a", "imp-owner"), nodes.p1);
    expect(Array.isArray(permissions) && permissions.every((id) => registry.get(id)?.kind === "read")).toBe(true);
    expect(permissions).toContain("core.member.read");
    expect(permissions).not.toContain("core.project.update");
  });

  it("limits an API key to its scopes intersected with its owner's permissions", async () => {
    expect(await effective(service("key-1"), nodes.p1)).toEqual(["core.project.read", "core.project.update", "core.unit.read"]);
    expect(await effective(service("key-viewer", "viewer-p1"), nodes.p1)).toEqual(["core.project.read", "core.unit.read"]);
    expect(await effective(service("key-1"), nodes.p2)).toBe("OUTSIDE_KEY_SCOPE");
  });

  it("applies the ceiling", async () => {
    expect(await effective(user("owner-a"), nodes.p1, new Set(["core.project.read", "core.fake.read"]))).toEqual(["core.project.read"]);
  });

  it("denies an outsider (not found for the caller) and a deleted node", async () => {
    expect(await effective(user("viewer-p1"), nodes.p2)).toBe("NOT_A_MEMBER");
    expect(await effective(user("owner-a"), nodes.unit("u1-gone"))).toBe("NODE_NOT_FOUND");
  });

  it("returns the staff role's platform permissions only with MFA", async () => {
    expect(await effective(user("staff-support", true), nodes.platform)).toEqual([
      "platform.audit-log.read",
      "platform.connector.read",
      "platform.organization.read",
      "platform.trace.read",
      "platform.usage.read",
      "platform.user.impersonate",
      "platform.user.read",
    ]);
    expect(await effective(user("staff-support"), nodes.platform)).toBe("MFA_REQUIRED");
    expect(await effective(user("owner-a", true), nodes.platform)).toBe("NOT_A_MEMBER");
  });
});
