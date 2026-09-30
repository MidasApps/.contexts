import { AGENT_PERMISSIONS, CORE_PERMISSIONS, type PermissionDefinition } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { CORE_PERMISSION_SOURCE, createPermissionRegistry, PermissionRegistryError } from "./permission-registry.ts";

const moduleSource = (permissions: readonly PermissionDefinition[]) => ({ moduleId: "sample", permissions });

const samplePermission = (overrides: Partial<PermissionDefinition> = {}): PermissionDefinition => ({
  id: "sample.invoice.read",
  descriptionKey: "permissions.sample.invoice.read",
  kind: "read",
  scope: "tenant",
  defaultRoles: ["member", "device"],
  ...overrides,
});

const captureCode = (build: () => unknown): string | undefined => {
  try {
    build();
    return undefined;
  } catch (error: unknown) {
    return error instanceof PermissionRegistryError ? error.code : "OTHER";
  }
};

describe("createPermissionRegistry", () => {
  it("indexes the core catalog", () => {
    const registry = createPermissionRegistry([CORE_PERMISSION_SOURCE]);
    expect(registry.get("core.project.read")).toMatchObject({ kind: "read", scope: "tenant" });
    expect(registry.get("sample.nothing.read")).toBeUndefined();
    expect(registry.list()).toHaveLength(CORE_PERMISSIONS.length);
  });

  it("registers the agent runtime permissions of the core catalog (SP3)", () => {
    const registry = createPermissionRegistry([CORE_PERMISSION_SOURCE]);
    for (const agent of AGENT_PERMISSIONS) expect(registry.get(agent.id)).toMatchObject({ id: agent.id, scope: "tenant" });
    expect(registry.permissionsForSystemRole("member").has("core.chat.use")).toBe(true);
    expect(registry.permissionsForSystemRole("member").has("core.connector.write")).toBe(false);
    expect(registry.permissionsForSystemRole("admin").has("core.connector.write")).toBe(true);
  });

  it("lists tenant permissions only, sorted by id", () => {
    const ids = createPermissionRegistry([CORE_PERMISSION_SOURCE]).listTenantPermissions().map((permission) => permission.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids.some((id) => id.startsWith("platform."))).toBe(false);
    expect(ids).toContain("core.organization.delete");
  });

  it("rejects a duplicate id across sources", () => {
    const duplicate = moduleSource([samplePermission(), samplePermission()]);
    expect(captureCode(() => createPermissionRegistry([CORE_PERMISSION_SOURCE, duplicate]))).toBe("DUPLICATE_PERMISSION");
    expect(captureCode(() => createPermissionRegistry([CORE_PERMISSION_SOURCE, CORE_PERMISSION_SOURCE]))).toBe("DUPLICATE_PERMISSION");
  });

  it("rejects a module id that is not kebab-case", () => {
    for (const moduleId of ["Sample", "1sample", "sample_mod", "sample.mod", ""]) {
      expect(captureCode(() => createPermissionRegistry([{ moduleId, permissions: [] }]))).toBe("INVALID_MODULE_ID");
    }
  });

  it("reserves the core and platform module ids for the core catalog", () => {
    const fakeCore = { moduleId: "core", permissions: [CORE_PERMISSIONS[0] as PermissionDefinition] };
    expect(captureCode(() => createPermissionRegistry([fakeCore]))).toBe("RESERVED_MODULE_ID");
    const fakePlatform = { moduleId: "platform", permissions: [] };
    expect(captureCode(() => createPermissionRegistry([CORE_PERMISSION_SOURCE, fakePlatform]))).toBe("RESERVED_MODULE_ID");
  });

  it("rejects a module permission outside the module prefix", () => {
    const outside = moduleSource([samplePermission({ id: "core.invoice.read" })]);
    expect(captureCode(() => createPermissionRegistry([outside]))).toBe("PERMISSION_OUTSIDE_MODULE");
    const platform = moduleSource([
      samplePermission({ id: "platform.invoice.read", scope: "platform", defaultRoles: ["platform-admin"] }),
    ]);
    expect(captureCode(() => createPermissionRegistry([platform]))).toBe("PERMISSION_OUTSIDE_MODULE");
  });

  it("rejects an invalid definition", () => {
    const invalid = moduleSource([samplePermission({ defaultRoles: ["platform-admin"] })]);
    expect(captureCode(() => createPermissionRegistry([invalid]))).toBe("INVALID_PERMISSION_DEFINITION");
  });

  it("accepts module permissions inside the module prefix", () => {
    const registry = createPermissionRegistry([CORE_PERMISSION_SOURCE, moduleSource([samplePermission()])]);
    expect(registry.get("sample.invoice.read")?.defaultRoles).toEqual(["member", "device"]);
  });
});

describe("permissionsForSystemRole", () => {
  const registry = createPermissionRegistry([
    CORE_PERMISSION_SOURCE,
    moduleSource([samplePermission(), samplePermission({ id: "sample.invoice.delete", kind: "write", defaultRoles: [] })]),
  ]);
  const tenantIds = registry.listTenantPermissions().map((permission) => permission.id);

  it("gives owner every tenant permission, module ones included", () => {
    expect([...registry.permissionsForSystemRole("owner")].sort()).toEqual([...tenantIds].sort());
  });

  it("gives admin every tenant permission except deleting the organization", () => {
    const admin = registry.permissionsForSystemRole("admin");
    expect(admin.has("core.organization.delete")).toBe(false);
    expect(admin.has("sample.invoice.delete")).toBe(true);
    expect(admin.size).toBe(tenantIds.length - 1);
  });

  it("gives member, viewer and device what the definitions list", () => {
    expect(registry.permissionsForSystemRole("viewer")).toEqual(new Set(["core.organization.read", "core.project.read", "core.unit.read"]));
    expect(registry.permissionsForSystemRole("member").has("core.member.read")).toBe(true);
    expect(registry.permissionsForSystemRole("member").has("core.member.invite")).toBe(false);
    expect(registry.permissionsForSystemRole("device")).toEqual(new Set(["sample.invoice.read"]));
  });

  it("never gives a platform permission to a system role", () => {
    expect([...registry.permissionsForSystemRole("owner")].some((id) => id.startsWith("platform."))).toBe(false);
  });
});

describe("permissionsForPlatformRole", () => {
  const registry = createPermissionRegistry([CORE_PERMISSION_SOURCE]);

  it("gives platform-admin every platform permission", () => {
    expect(registry.permissionsForPlatformRole("platform-admin")).toEqual(
      new Set(["platform.organization.read", "platform.user.read", "platform.audit-log.read", "platform.user.impersonate", "platform.staff.manage"]),
    );
  });

  it("gives platform-support reads and impersonation only", () => {
    expect(registry.permissionsForPlatformRole("platform-support")).toEqual(
      new Set(["platform.organization.read", "platform.user.read", "platform.audit-log.read", "platform.user.impersonate"]),
    );
  });
});
