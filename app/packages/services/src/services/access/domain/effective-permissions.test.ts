import { MembershipIdSchema, OrganizationIdSchema, ProjectIdSchema, RoleIdSchema, type RoleRef } from "@core/contracts";
import { describe, expect, it } from "vitest";
import type { CustomRoleRecord, GrantRecord } from "./grant.ts";
import { computeEffectivePermissions } from "./effective-permissions.ts";
import type { NodeChain } from "./node-chain.ts";
import { CORE_PERMISSION_SOURCE, createPermissionRegistry } from "./permission-registry.ts";

const registry = createPermissionRegistry([CORE_PERMISSION_SOURCE]);
const tenantId = OrganizationIdSchema.parse("org-1");
const chain: NodeChain = {
  organization: { id: "org-1", tenantId, isDeleted: false, status: "active" },
  project: { id: "proj-1", tenantId, isDeleted: false },
  units: [],
};

const grant = (nodeId: string, roles: readonly RoleRef[], overrides: Partial<GrantRecord> = {}): GrantRecord => ({
  membershipId: MembershipIdSchema.parse(`m-${nodeId}`),
  tenantId,
  principalId: "user-1",
  nodeId,
  roles,
  isDeleted: false,
  ...overrides,
});

const customRole = (id: string, permissions: readonly string[], overrides: Partial<CustomRoleRecord> = {}): CustomRoleRecord => ({
  id: RoleIdSchema.parse(id),
  tenantId,
  permissions,
  isDeleted: false,
  ...overrides,
});

const viewer: RoleRef = { kind: "system", key: "viewer" };
const custom = (id: string): RoleRef => ({ kind: "custom", roleId: RoleIdSchema.parse(id) });

describe("computeEffectivePermissions", () => {
  it("unions the permissions of every grant on the chain and records their sources", () => {
    const result = computeEffectivePermissions({
      grants: [grant("org-1", [viewer]), grant("proj-1", [custom("editor")])],
      chain,
      customRoles: [customRole("editor", ["core.project.update"])],
      registry,
    });
    expect([...result.permissions].sort()).toEqual(["core.organization.read", "core.project.read", "core.project.update", "core.unit.read"]);
    expect(result.sources.get("core.project.update")).toEqual([
      { kind: "membership", membershipId: "m-proj-1", nodeId: "proj-1", roles: [custom("editor")] },
    ]);
    expect(result.sources.get("core.project.read")?.map((source) => (source.kind === "membership" ? source.nodeId : ""))).toEqual(["org-1"]);
  });

  it("ignores deleted grants, grants off the chain and grants of another tenant", () => {
    const result = computeEffectivePermissions({
      grants: [
        grant("org-1", [viewer], { isDeleted: true }),
        grant("proj-2", [viewer]),
        grant("org-1", [viewer], { tenantId: OrganizationIdSchema.parse("org-2") }),
      ],
      chain,
      customRoles: [],
      registry,
    });
    expect(result.permissions.size).toBe(0);
  });

  it("ignores deleted custom roles, roles of another tenant and unknown or platform permission ids", () => {
    const result = computeEffectivePermissions({
      grants: [grant("proj-1", [custom("gone"), custom("foreign"), custom("odd")])],
      chain,
      customRoles: [
        customRole("gone", ["core.project.update"], { isDeleted: true }),
        customRole("foreign", ["core.project.delete"], { tenantId: OrganizationIdSchema.parse("org-2") }),
        customRole("odd", ["core.nothing.read", "platform.user.read", "core.unit.read"]),
      ],
      registry,
    });
    expect([...result.permissions]).toEqual(["core.unit.read"]);
  });

  it("intersects with the ceiling when one is given", () => {
    const result = computeEffectivePermissions({
      grants: [grant("org-1", [{ kind: "system", key: "owner" }])],
      chain: { ...chain, project: { id: ProjectIdSchema.parse("proj-1"), tenantId, isDeleted: false } },
      customRoles: [],
      registry,
      ceiling: new Set(["core.project.read", "platform.user.read"]),
    });
    expect([...result.permissions]).toEqual(["core.project.read"]);
  });
});
