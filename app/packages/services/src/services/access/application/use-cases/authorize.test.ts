import type { NodeRef, Principal } from "@core/contracts";
import { describe, expect, it } from "vitest";
import type { AccessReaders } from "../ports/driven/access-readers.ts";
import { createRequestScope } from "../request-scope.ts";
import { type AccessWorld, createAccessWorld, nodes, principals } from "./access-world.fixture.ts";
import { makeAuthorize } from "./authorize.ts";

const { user, device, service, impersonated } = principals;

const authorizeIn = (world: AccessWorld, readers: AccessReaders = world.store) =>
  makeAuthorize({ registry: world.registry, readers, clock: world.clock });

const decide = async (principal: Principal, permission: string, node: NodeRef, ceiling?: ReadonlySet<string>) =>
  authorizeIn(createAccessWorld())({ principal, permission, node, ceiling });

const reasonOf = async (principal: Principal, permission: string, node: NodeRef, ceiling?: ReadonlySet<string>) => {
  const decision = await decide(principal, permission, node, ceiling);
  return decision.allowed ? "ALLOWED" : decision.reason;
};

describe("authorize: inheritance organization → project → unit → sub-unit", () => {
  it("lets an organization owner write at a deep unit", async () => {
    expect(await reasonOf(user("owner-a"), "core.unit.update", nodes.unit("u1a-i"))).toBe("ALLOWED");
  });

  it("lets a project viewer read every unit below the project", async () => {
    expect(await reasonOf(user("viewer-p1"), "core.unit.read", nodes.unit("u1a-i"))).toBe("ALLOWED");
  });

  it("does not give a viewer write permissions", async () => {
    expect(await reasonOf(user("viewer-p1"), "core.project.update", nodes.p1)).toBe("PERMISSION_NOT_GRANTED");
  });

  it("applies a unit grant to the unit and its descendants, with its source", async () => {
    const decision = await decide(user("editor-u1"), "core.unit.update", nodes.unit("u1a"));
    expect(decision).toMatchObject({ allowed: true, requiresApproval: false });
    expect(decision.allowed && decision.grantedVia).toEqual([
      {
        kind: "membership",
        membershipId: expect.any(String) as string,
        nodeId: "u1",
        roles: [{ kind: "custom", roleId: "role-editor" }],
      },
    ]);
    expect(await reasonOf(user("editor-u1"), "core.unit.update", nodes.unit("u1"))).toBe("ALLOWED");
  });

  it("never lets a grant flow upwards", async () => {
    expect(await reasonOf(user("editor-u1"), "core.unit.read", nodes.p1)).toBe("NOT_A_MEMBER");
    expect(await reasonOf(user("member-u1a"), "core.unit.read", nodes.unit("u1"))).toBe("NOT_A_MEMBER");
  });

  it("lets a unit member read its sub-units", async () => {
    expect(await reasonOf(user("member-u1a"), "core.unit.read", nodes.unit("u1a-i"))).toBe("ALLOWED");
  });
});

describe("authorize: isolation", () => {
  it("isolates sibling units", async () => {
    expect(await reasonOf(user("member-u1a"), "core.unit.read", nodes.unit("u1b"))).toBe("NOT_A_MEMBER");
  });

  it("isolates sibling projects and the organization level", async () => {
    expect(await reasonOf(user("viewer-p1"), "core.project.read", nodes.p2)).toBe("NOT_A_MEMBER");
    expect(await reasonOf(user("viewer-p1"), "core.organization.read", nodes.orgA)).toBe("NOT_A_MEMBER");
  });

  it("keeps the grants of two organizations of the same user apart", async () => {
    expect(await reasonOf(user("multi"), "core.project.delete", nodes.pb)).toBe("ALLOWED");
    expect(await reasonOf(user("multi"), "core.project.read", nodes.p2)).toBe("ALLOWED");
    expect(await reasonOf(user("multi"), "core.project.delete", nodes.p2)).toBe("PERMISSION_NOT_GRANTED");
    expect(await reasonOf(user("multi"), "core.project.read", nodes.p1)).toBe("NOT_A_MEMBER");
  });

  it("denies another organization's owner", async () => {
    expect(await reasonOf(user("owner-a"), "core.organization.read", nodes.orgB)).toBe("NOT_A_MEMBER");
  });
});

describe("authorize: roles, grants and nodes from the source", () => {
  it("ignores a deleted custom role", async () => {
    expect(await reasonOf(user("gone-role"), "core.project.read", nodes.p1)).toBe("PERMISSION_NOT_GRANTED");
  });

  it("ignores unknown and platform permission ids inside a custom role", async () => {
    expect(await reasonOf(user("odd-role"), "core.unit.read", nodes.unit("u1"))).toBe("ALLOWED");
  });

  it("ignores a deleted grant", async () => {
    expect(await reasonOf(user("deleted-grant"), "core.organization.read", nodes.orgA)).toBe("NOT_A_MEMBER");
  });

  it("denies deleted nodes: unit, ancestor, project and organization", async () => {
    expect(await reasonOf(user("owner-a"), "core.unit.read", nodes.unit("u1-gone"))).toBe("NODE_NOT_FOUND");
    expect(await reasonOf(user("owner-a"), "core.unit.read", nodes.unit("u1-gone-child"))).toBe("NODE_NOT_FOUND");
    expect(
      await reasonOf(user("owner-a"), "core.project.read", { ...nodes.p1, projectId: "p-deleted" } as NodeRef),
    ).toBe("NODE_NOT_FOUND");
    expect(
      await reasonOf(user("owner-a"), "core.organization.read", {
        level: "organization",
        tenantId: "org-deleted",
      } as NodeRef),
    ).toBe("NODE_NOT_FOUND");
  });

  it("denies a node that does not exist or does not match its parents", async () => {
    expect(await reasonOf(user("owner-a"), "core.unit.read", nodes.unit("nope"))).toBe("NODE_NOT_FOUND");
    expect(await reasonOf(user("owner-a"), "core.unit.read", nodes.unit("u2", "p1"))).toBe("NODE_NOT_FOUND");
    expect(await reasonOf(user("owner-a"), "core.project.read", { ...nodes.pb, tenantId: "org-a" } as NodeRef)).toBe(
      "NODE_NOT_FOUND",
    );
    expect(await reasonOf(user("owner-a"), "core.unit.read", nodes.unit("ub", "pb", "org-a"))).toBe("NODE_NOT_FOUND");
  });

  it("denies everything in a suspended organization", async () => {
    const node = { level: "project", tenantId: "org-suspended", projectId: "ps" } as NodeRef;
    expect(await reasonOf(user("suspended-owner"), "core.project.read", node)).toBe("ORGANIZATION_SUSPENDED");
  });

  it("denies an unknown permission and a scope mismatch", async () => {
    expect(await reasonOf(user("owner-a"), "core.fake.read", nodes.orgA)).toBe("UNKNOWN_PERMISSION");
    expect(await reasonOf(user("owner-a"), "core.project.read", nodes.platform)).toBe("SCOPE_MISMATCH");
    expect(await reasonOf(user("staff-admin", true), "platform.user.read", nodes.orgA)).toBe("SCOPE_MISMATCH");
  });

  it("denies a disabled user and a user without a profile", async () => {
    expect(await reasonOf(user("disabled"), "core.organization.read", nodes.orgA)).toBe("PRINCIPAL_INACTIVE");
    expect(await reasonOf(user("ghost"), "core.organization.read", nodes.orgA)).toBe("PRINCIPAL_INACTIVE");
  });

  it("copies requiresApproval from the definition", async () => {
    expect(await decide(user("owner-a"), "sample.invoice.delete", nodes.p1)).toMatchObject({
      allowed: true,
      requiresApproval: true,
    });
  });
});

describe("authorize: device principal", () => {
  it("allows an active device through its own grant", async () => {
    expect(await reasonOf(device("dev-1"), "core.project.read", nodes.p1)).toBe("ALLOWED");
    expect(await reasonOf(device("dev-1"), "core.project.update", nodes.p1)).toBe("PERMISSION_NOT_GRANTED");
  });

  it("denies a revoked device", async () => {
    expect(await reasonOf(device("dev-revoked"), "core.project.read", nodes.p1)).toBe("PRINCIPAL_INACTIVE");
  });

  it("denies a device outside its tenant, or whose tenant claim is wrong", async () => {
    expect(await reasonOf(device("dev-b", "org-b"), "core.project.read", nodes.p1)).toBe("NOT_A_MEMBER");
    expect(await reasonOf(device("dev-b", "org-a"), "core.project.read", nodes.p1)).toBe("PRINCIPAL_INACTIVE");
    expect(await reasonOf(device("dev-unknown"), "core.project.read", nodes.p1)).toBe("PRINCIPAL_INACTIVE");
  });
});

describe("authorize: service principal (API key)", () => {
  it("allows a scope the owner holds, inside the key's node", async () => {
    expect(await reasonOf(service("key-1"), "core.project.read", nodes.p1)).toBe("ALLOWED");
    expect(await reasonOf(service("key-1"), "core.unit.read", nodes.unit("u1a"))).toBe("ALLOWED");
  });

  it("denies a permission outside the key's scopes even when the owner holds it", async () => {
    expect(await reasonOf(service("key-1"), "core.project.delete", nodes.p1)).toBe("OUTSIDE_KEY_SCOPE");
  });

  it("denies a node outside the key's node", async () => {
    expect(await reasonOf(service("key-1"), "core.project.read", nodes.p2)).toBe("OUTSIDE_KEY_SCOPE");
    expect(await reasonOf(service("key-1"), "core.organization.read", nodes.orgA)).toBe("OUTSIDE_KEY_SCOPE");
    expect(await reasonOf(service("key-u1a"), "core.unit.read", nodes.unit("u1b"))).toBe("OUTSIDE_KEY_SCOPE");
    expect(await reasonOf(service("key-u1a"), "core.unit.read", nodes.unit("u1a-i"))).toBe("ALLOWED");
    expect(await reasonOf(service("key-org"), "core.organization.read", nodes.orgA)).toBe("ALLOWED");
  });

  it("intersects scopes with the owner's current grants", async () => {
    expect(await reasonOf(service("key-viewer", "viewer-p1"), "core.project.update", nodes.p1)).toBe(
      "PERMISSION_NOT_GRANTED",
    );
    expect(await reasonOf(service("key-orphan", "orphan-owner"), "core.project.read", nodes.p1)).toBe("NOT_A_MEMBER");
  });

  it("denies an expired key, a revoked key and a key of a disabled owner", async () => {
    expect(await reasonOf(service("key-expired"), "core.project.read", nodes.p1)).toBe("KEY_EXPIRED");
    expect(await reasonOf(service("key-now"), "core.project.read", nodes.p1)).toBe("KEY_EXPIRED");
    expect(await reasonOf(service("key-revoked"), "core.project.read", nodes.p1)).toBe("PRINCIPAL_INACTIVE");
    expect(await reasonOf(service("key-disabled-owner", "disabled"), "core.project.read", nodes.p1)).toBe(
      "PRINCIPAL_INACTIVE",
    );
  });

  it("denies a key whose expiry cannot be parsed (fail-closed)", async () => {
    expect(await reasonOf(service("key-bad-expiry"), "core.project.read", nodes.p1)).toBe("KEY_EXPIRED");
  });

  it("denies a node of another tenant, even inside a key node stored with the wrong tenant", async () => {
    expect(await reasonOf(service("key-foreign-node"), "core.project.read", nodes.pb)).toBe("OUTSIDE_KEY_SCOPE");
    expect(await reasonOf(service("key-1"), "core.project.read", nodes.pb)).toBe("OUTSIDE_KEY_SCOPE");
  });

  it("denies a key whose claims do not match the stored key", async () => {
    expect(await reasonOf(service("key-1", "viewer-p1"), "core.project.read", nodes.p1)).toBe("PRINCIPAL_INACTIVE");
    expect(await reasonOf(service("key-1", "owner-a", "org-b"), "core.project.read", nodes.p1)).toBe(
      "PRINCIPAL_INACTIVE",
    );
    expect(await reasonOf(service("key-missing"), "core.project.read", nodes.p1)).toBe("PRINCIPAL_INACTIVE");
  });
});

describe("authorize: platform staff", () => {
  it("allows an active platform-admin with MFA and says which role granted it", async () => {
    expect(await decide(user("staff-admin", true), "platform.staff.manage", nodes.platform)).toEqual({
      allowed: true,
      requiresApproval: false,
      grantedVia: [{ kind: "platform-role", role: "platform-admin" }],
    });
  });

  it("requires MFA", async () => {
    expect(await reasonOf(user("staff-admin"), "platform.user.read", nodes.platform)).toBe("MFA_REQUIRED");
  });

  it("limits platform-support to reads and impersonation", async () => {
    expect(await reasonOf(user("staff-support", true), "platform.user.read", nodes.platform)).toBe("ALLOWED");
    expect(await reasonOf(user("staff-support", true), "platform.staff.manage", nodes.platform)).toBe(
      "PERMISSION_NOT_GRANTED",
    );
  });

  it("denies inactive staff, non-staff and non-user principals", async () => {
    expect(await reasonOf(user("staff-off", true), "platform.user.read", nodes.platform)).toBe("PRINCIPAL_INACTIVE");
    expect(await reasonOf(user("owner-a", true), "platform.user.read", nodes.platform)).toBe("NOT_A_MEMBER");
    expect(await reasonOf(device("dev-1"), "platform.user.read", nodes.platform)).toBe("PERMISSION_NOT_GRANTED");
    expect(await reasonOf(user("disabled", true), "platform.user.read", nodes.platform)).toBe("PRINCIPAL_INACTIVE");
  });
});

describe("authorize: impersonation (read-only, time-boxed)", () => {
  it("allows the target's reads", async () => {
    expect(await reasonOf(impersonated("owner-a", "imp-owner"), "core.project.read", nodes.p1)).toBe("ALLOWED");
  });

  it("denies writes even when the target could", async () => {
    expect(await reasonOf(impersonated("owner-a", "imp-owner"), "core.project.update", nodes.p1)).toBe(
      "IMPERSONATION_READ_ONLY",
    );
  });

  it("denies an expired, ended, unknown or mismatched session", async () => {
    expect(await reasonOf(impersonated("owner-a", "imp-expired"), "core.project.read", nodes.p1)).toBe(
      "IMPERSONATION_EXPIRED",
    );
    expect(await reasonOf(impersonated("owner-a", "imp-ended"), "core.project.read", nodes.p1)).toBe(
      "IMPERSONATION_EXPIRED",
    );
    expect(await reasonOf(impersonated("owner-a", "imp-missing"), "core.project.read", nodes.p1)).toBe(
      "IMPERSONATION_EXPIRED",
    );
    expect(await reasonOf(impersonated("owner-a", "imp-other-tenant"), "core.project.read", nodes.p1)).toBe(
      "IMPERSONATION_EXPIRED",
    );
    expect(await reasonOf(impersonated("owner-a", "imp-other-target"), "core.project.read", nodes.p1)).toBe(
      "IMPERSONATION_EXPIRED",
    );
  });

  it("denies a session whose expiry cannot be parsed (fail-closed)", async () => {
    expect(await reasonOf(impersonated("owner-a", "imp-bad-expiry"), "core.project.read", nodes.p1)).toBe(
      "IMPERSONATION_EXPIRED",
    );
  });

  it("denies when the staff member is no longer active staff or no longer an active user", async () => {
    expect(
      await reasonOf(impersonated("owner-a", "imp-by-staff-off", "staff-off"), "core.project.read", nodes.p1),
    ).toBe("IMPERSONATION_EXPIRED");
    expect(
      await reasonOf(impersonated("owner-a", "imp-by-disabled-staff", "staff-disabled"), "core.project.read", nodes.p1),
    ).toBe("IMPERSONATION_EXPIRED");
    expect(
      await reasonOf(impersonated("owner-a", "imp-by-non-staff", "viewer-p1"), "core.project.read", nodes.p1),
    ).toBe("IMPERSONATION_EXPIRED");
  });

  it("never grants platform permissions through impersonation", async () => {
    expect(await reasonOf(impersonated("staff-admin", "imp-owner"), "platform.user.read", nodes.platform)).toBe(
      "PERMISSION_NOT_GRANTED",
    );
  });
});

describe("authorize: agent ceiling", () => {
  it("denies a permission the ceiling excludes and allows one it includes", async () => {
    const ceiling = new Set(["core.project.read"]);
    expect(await reasonOf(user("owner-a"), "core.project.update", nodes.p1, ceiling)).toBe("CEILING_EXCLUDES");
    expect(await reasonOf(user("owner-a"), "core.project.read", nodes.p1, ceiling)).toBe("ALLOWED");
    expect(await reasonOf(user("staff-admin", true), "platform.user.read", nodes.platform, new Set())).toBe(
      "CEILING_EXCLUDES",
    );
  });

  it("still reports a missing grant before the ceiling", async () => {
    expect(await reasonOf(user("viewer-p1"), "core.project.update", nodes.p1, new Set(["core.project.update"]))).toBe(
      "PERMISSION_NOT_GRANTED",
    );
  });
});

describe("authorize: fail-closed and per-request reads", () => {
  const failing = (world: AccessWorld, port: "grants" | "nodeChains" | "principals"): AccessReaders => {
    const boom = () => Promise.reject(new Error("firestore unavailable"));
    if (port === "grants") return { ...world.store, grants: { listGrants: boom } };
    if (port === "nodeChains") return { ...world.store, nodeChains: { loadChain: boom } };
    return { ...world.store, principals: { ...world.store.principals, getUser: boom } };
  };

  it.each(["grants", "nodeChains", "principals"] as const)(
    "rejects (never allows) when the %s reader throws",
    async (port) => {
      const world = createAccessWorld();
      const authorize = authorizeIn(world, failing(world, port));
      await expect(
        authorize({ principal: user("owner-a"), permission: "core.project.read", node: nodes.p1 }),
      ).rejects.toThrow("firestore unavailable");
    },
  );

  it("reads each source once per request scope, and again in a new scope", async () => {
    const world = createAccessWorld();
    const scoped = authorizeIn(world, createRequestScope(world.store));
    await scoped({ principal: user("owner-a"), permission: "core.project.read", node: nodes.p1 });
    await scoped({ principal: user("owner-a"), permission: "core.project.update", node: nodes.p1 });
    expect(world.store.callCount("loadChain")).toBe(1);
    expect(world.store.callCount("listGrants")).toBe(1);
    await authorizeIn(
      world,
      createRequestScope(world.store),
    )({ principal: user("owner-a"), permission: "core.project.read", node: nodes.p1 });
    expect(world.store.callCount("loadChain")).toBe(2);
  });

  it("sees a revoked grant on the next request", async () => {
    const world = createAccessWorld();
    const request = { principal: user("viewer-p1"), permission: "core.project.read", node: nodes.p1 } as const;
    expect((await authorizeIn(world, createRequestScope(world.store))(request)).allowed).toBe(true);
    world.store.putUser("viewer-p1", "disabled");
    expect(await authorizeIn(world, createRequestScope(world.store))(request)).toEqual({
      allowed: false,
      reason: "PRINCIPAL_INACTIVE",
    });
  });
});
