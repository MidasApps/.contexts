import { describe, expect, it } from "vitest";
import { PermissionSchema } from "../primitives/catalog-meta.schema.ts";
import { AGENT_PERMISSIONS } from "../agents/agent-permissions.ts";
import { CORE_PERMISSIONS, SP1_PERMISSIONS } from "./core-permissions.ts";
import { PermissionDefinitionSchema } from "./permission-definition.schema.ts";

const ids = CORE_PERMISSIONS.map((permission) => permission.id);
const sp1Ids = SP1_PERMISSIONS.map((permission) => permission.id);
const tenantPermissions = CORE_PERMISSIONS.filter((permission) => permission.scope === "tenant");
const sp1TenantPermissions = SP1_PERMISSIONS.filter((permission) => permission.scope === "tenant");
const platformPermissions = CORE_PERMISSIONS.filter((permission) => permission.scope === "platform");
const rolesOf = (id: string) => CORE_PERMISSIONS.find((permission) => permission.id === id)?.defaultRoles;

describe("CORE_PERMISSIONS", () => {
  it("has unique, well-formed ids and valid definitions", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const permission of CORE_PERMISSIONS) {
      expect(PermissionSchema.safeParse(permission.id).success).toBe(true);
      expect(PermissionDefinitionSchema.safeParse(permission).success).toBe(true);
    }
  });

  it("lists exactly the permissions of SP1 spec §5.1", () => {
    expect([...sp1Ids].sort()).toEqual(
      [
        "core.organization.read", "core.organization.update", "core.organization.delete",
        "core.project.read", "core.project.create", "core.project.update", "core.project.delete",
        "core.unit.read", "core.unit.create", "core.unit.update", "core.unit.delete",
        "core.member.read", "core.member.invite", "core.member.update", "core.member.remove",
        "core.role.read", "core.role.create", "core.role.update", "core.role.delete",
        "core.api-key.read", "core.api-key.create", "core.api-key.revoke",
        "core.device.read", "core.device.create", "core.device.revoke",
        "core.audit-log.read", "core.approval.read", "core.approval.decide",
        "platform.organization.read", "platform.user.read", "platform.audit-log.read",
        "platform.user.impersonate", "platform.staff.manage",
      ].sort(),
    );
  });

  it("includes every agent runtime permission (SP3 spec §2.2) unchanged", () => {
    expect(ids).toEqual([...sp1Ids, ...AGENT_PERMISSIONS.map((permission) => permission.id)]);
    for (const agent of AGENT_PERMISSIONS) expect(CORE_PERMISSIONS.find((permission) => permission.id === agent.id)).toEqual(agent);
  });

  it("gives every tenant permission at least one default role, owner included", () => {
    for (const permission of tenantPermissions) {
      expect(permission.defaultRoles.length).toBeGreaterThan(0);
      expect(permission.defaultRoles).toContain("owner");
    }
  });

  it("gives admin every tenant permission except deleting the organization", () => {
    const withoutAdmin = tenantPermissions.filter((permission) => !permission.defaultRoles.includes("admin")).map((p) => p.id);
    expect(withoutAdmin).toEqual(["core.organization.delete"]);
  });

  it("keeps member and viewer to the rows of the spec", () => {
    const holders = (role: "member" | "viewer") =>
      sp1TenantPermissions.filter((permission) => permission.defaultRoles.includes(role)).map((permission) => permission.id).sort();
    expect(holders("viewer")).toEqual(["core.organization.read", "core.project.read", "core.unit.read"]);
    expect(holders("member")).toEqual(
      ["core.approval.read", "core.member.read", "core.organization.read", "core.project.read", "core.role.read", "core.unit.read"],
    );
  });

  it("marks the SP1 reads and writes by the action", () => {
    for (const permission of SP1_PERMISSIONS) {
      const readAction = /\.read$/.test(permission.id);
      expect(permission.kind).toBe(readAction ? "read" : "write");
    }
  });

  it("scopes platform.* to the platform with staff roles only", () => {
    for (const permission of platformPermissions) expect(permission.id.startsWith("platform.")).toBe(true);
    for (const permission of tenantPermissions) expect(permission.id.startsWith("core.")).toBe(true);
    expect(rolesOf("platform.staff.manage")).toEqual(["platform-admin"]);
    expect(rolesOf("platform.user.impersonate")).toEqual(["platform-admin", "platform-support"]);
  });
});

describe("PermissionDefinitionSchema", () => {
  const base = { id: "sample.thing.read", descriptionKey: "permissions.sample.thing.read", kind: "read", scope: "tenant", defaultRoles: ["member"] };

  it("rejects platform roles on a tenant permission and tenant roles on a platform permission", () => {
    expect(PermissionDefinitionSchema.safeParse({ ...base, defaultRoles: ["platform-admin"] }).success).toBe(false);
    expect(
      PermissionDefinitionSchema.safeParse({ ...base, id: "platform.thing.read", scope: "platform", defaultRoles: ["owner"] }).success,
    ).toBe(false);
  });

  it("requires platform permissions to use the platform. prefix, and only them", () => {
    expect(PermissionDefinitionSchema.safeParse({ ...base, scope: "platform", defaultRoles: [] }).success).toBe(false);
    expect(PermissionDefinitionSchema.safeParse({ ...base, id: "platform.thing.read" }).success).toBe(false);
  });

  it("accepts a module permission with approval", () => {
    expect(PermissionDefinitionSchema.safeParse({ ...base, kind: "write", id: "sample.thing.delete", requiresApproval: true }).success).toBe(true);
  });
});
