import { describe, expect, it } from "vitest";
import { fixedClock } from "../shared/clock/clock.ts";
import { createInMemoryAccessStore } from "./adapters/driven/in-memory-access-store.ts";
import { APPROVAL_PERMISSION, nodes, principals } from "./application/use-cases/access-world.fixture.ts";
import { createAccessCore } from "./composition.ts";
import { PermissionRegistryError } from "./domain/permission-registry.ts";

const seeded = () => {
  const store = createInMemoryAccessStore();
  store.putOrganization({ id: "org-a" });
  store.putProject({ id: "p1", tenantId: "org-a" });
  store.putUser("owner-a");
  store.putGrant({ tenantId: "org-a", principalId: "owner-a", nodeId: "org-a", roles: [{ kind: "system", key: "owner" }] });
  return store;
};

describe("createAccessCore", () => {
  it("always registers the core catalog and adds module permissions", () => {
    const core = createAccessCore({ readers: seeded(), permissions: [{ moduleId: "sample", permissions: [APPROVAL_PERMISSION] }] });
    expect(core.registry.get("core.project.read")).toBeDefined();
    expect(core.registry.get("sample.invoice.delete")?.requiresApproval).toBe(true);
  });

  it("rejects conflicting module permissions at startup", () => {
    const duplicate = { moduleId: "sample", permissions: [APPROVAL_PERMISSION, APPROVAL_PERMISSION] };
    expect(() => createAccessCore({ readers: seeded(), permissions: [duplicate] })).toThrow(PermissionRegistryError);
  });

  it("gives each request its own memoized reads", async () => {
    const store = seeded();
    const core = createAccessCore({ readers: store, clock: fixedClock("2026-09-29T12:00:00.000Z") });
    const first = core.forRequest();
    await first.authorize({ principal: principals.user("owner-a"), permission: "core.project.read", node: nodes.p1 });
    await first.getEffectivePermissions({ principal: principals.user("owner-a"), node: nodes.p1 });
    expect(store.callCount("loadChain")).toBe(1);
    await core.forRequest().authorize({ principal: principals.user("owner-a"), permission: "core.project.read", node: nodes.p1 });
    expect(store.callCount("loadChain")).toBe(2);
  });
});
