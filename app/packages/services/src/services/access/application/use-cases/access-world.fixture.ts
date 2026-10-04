// Test data factory for the authorize()/getEffectivePermissions() matrices: each call
// builds a fresh world, so tests never share mutable state (rule `testing`).
import {
  ApiKeyIdSchema,
  DeviceIdSchema,
  ImpersonationSessionIdSchema,
  type NodeRef,
  OrganizationIdSchema,
  type PermissionDefinition,
  type Principal,
  ProjectIdSchema,
  RoleIdSchema,
  type TenantNodeRef,
  UnitIdSchema,
  UserIdSchema,
} from "@core/contracts";
import { fixedClock } from "../../../shared/clock/clock.ts";
import { createInMemoryAccessStore, type InMemoryAccessStore } from "../../adapters/driven/in-memory-access-store.ts";
import {
  CORE_PERMISSION_SOURCE,
  createPermissionRegistry,
  type PermissionRegistry,
} from "../../domain/permission-registry.ts";

export const NOW = "2026-09-29T12:00:00.000Z";
const LATER = "2026-12-01T00:00:00.000Z";
const EARLIER = "2026-09-01T00:00:00.000Z";

const tenant = (id: string) => OrganizationIdSchema.parse(id);

/** Node refs of the world: org-a (p1: u1 > u1a > u1a-i, u1 > u1b; p2: u2), org-b (pb). */
export const nodes = {
  platform: { level: "platform" },
  orgA: { level: "organization", tenantId: tenant("org-a") },
  orgB: { level: "organization", tenantId: tenant("org-b") },
  p1: { level: "project", tenantId: tenant("org-a"), projectId: ProjectIdSchema.parse("p1") },
  p2: { level: "project", tenantId: tenant("org-a"), projectId: ProjectIdSchema.parse("p2") },
  pb: { level: "project", tenantId: tenant("org-b"), projectId: ProjectIdSchema.parse("pb") },
  unit: (unitId: string, projectId = "p1", tenantId = "org-a"): TenantNodeRef => ({
    level: "unit",
    tenantId: tenant(tenantId),
    projectId: ProjectIdSchema.parse(projectId),
    unitId: UnitIdSchema.parse(unitId),
  }),
} as const satisfies Record<string, NodeRef | ((...args: never[]) => NodeRef)>;

export const principals = {
  user: (uid: string, mfa = false): Principal => ({ type: "user", uid: UserIdSchema.parse(uid), mfa }),
  impersonated: (uid: string, sessionId: string, staffUid = "staff-support"): Principal => ({
    type: "user",
    uid: UserIdSchema.parse(uid),
    mfa: false,
    impersonation: { sessionId: ImpersonationSessionIdSchema.parse(sessionId), staffUid: UserIdSchema.parse(staffUid) },
  }),
  device: (deviceId: string, tenantId = "org-a"): Principal => ({
    type: "device",
    deviceId: DeviceIdSchema.parse(deviceId),
    tenantId: tenant(tenantId),
  }),
  service: (apiKeyId: string, ownerUid = "owner-a", tenantId = "org-a"): Principal => ({
    type: "service",
    apiKeyId: ApiKeyIdSchema.parse(apiKeyId),
    tenantId: tenant(tenantId),
    ownerUid: UserIdSchema.parse(ownerUid),
  }),
};

/** A module permission that needs four-eyes approval, to check `requiresApproval`. */
export const APPROVAL_PERMISSION: PermissionDefinition = {
  id: "sample.invoice.delete",
  descriptionKey: "permissions.sample.invoice.delete",
  kind: "write",
  scope: "tenant",
  requiresApproval: true,
  defaultRoles: [],
};

const seedTree = (store: InMemoryAccessStore): void => {
  store.putOrganization({ id: "org-a" });
  store.putOrganization({ id: "org-b" });
  store.putOrganization({ id: "org-suspended", status: "suspended" });
  store.putOrganization({ id: "org-deleted", isDeleted: true });
  store.putProject({ id: "p1", tenantId: "org-a" });
  store.putProject({ id: "p2", tenantId: "org-a" });
  store.putProject({ id: "p-deleted", tenantId: "org-a", isDeleted: true });
  store.putProject({ id: "pb", tenantId: "org-b" });
  store.putProject({ id: "ps", tenantId: "org-suspended" });
  store.putUnit({ id: "u1", tenantId: "org-a", projectId: "p1" });
  store.putUnit({ id: "u1a", tenantId: "org-a", projectId: "p1", ancestorIds: ["u1"] });
  store.putUnit({ id: "u1a-i", tenantId: "org-a", projectId: "p1", ancestorIds: ["u1", "u1a"] });
  store.putUnit({ id: "u1b", tenantId: "org-a", projectId: "p1", ancestorIds: ["u1"] });
  store.putUnit({ id: "u1-gone", tenantId: "org-a", projectId: "p1", ancestorIds: ["u1"], isDeleted: true });
  store.putUnit({ id: "u1-gone-child", tenantId: "org-a", projectId: "p1", ancestorIds: ["u1", "u1-gone"] });
  store.putUnit({ id: "u2", tenantId: "org-a", projectId: "p2" });
  store.putUnit({ id: "ub", tenantId: "org-b", projectId: "pb" });
};

const seedUsers = (store: InMemoryAccessStore): void => {
  for (const uid of [
    "owner-a",
    "viewer-p1",
    "editor-u1",
    "member-u1a",
    "multi",
    "odd-role",
    "gone-role",
    "deleted-grant",
  ])
    store.putUser(uid);
  for (const uid of ["staff-admin", "staff-support", "staff-off", "suspended-owner", "orphan-owner"])
    store.putUser(uid);
  store.putUser("disabled", "disabled");
  store.putUser("staff-disabled", "disabled");
  const grant = (
    principalId: string,
    tenantId: string,
    nodeId: string,
    key: "owner" | "member" | "viewer" | "device",
  ) => store.putGrant({ tenantId, principalId, nodeId, roles: [{ kind: "system", key }] });
  const custom = (principalId: string, nodeId: string, roleId: string) =>
    store.putGrant({
      tenantId: "org-a",
      principalId,
      nodeId,
      roles: [{ kind: "custom", roleId: RoleIdSchema.parse(roleId) }],
    });
  grant("owner-a", "org-a", "org-a", "owner");
  grant("viewer-p1", "org-a", "p1", "viewer");
  grant("member-u1a", "org-a", "u1a", "member");
  grant("multi", "org-b", "org-b", "owner");
  grant("multi", "org-a", "p2", "viewer");
  grant("disabled", "org-a", "org-a", "owner");
  grant("suspended-owner", "org-suspended", "org-suspended", "owner");
  custom("editor-u1", "u1", "role-editor");
  custom("odd-role", "p1", "role-odd");
  custom("gone-role", "p1", "role-gone");
  store.putGrant({
    tenantId: "org-a",
    principalId: "deleted-grant",
    nodeId: "org-a",
    roles: [{ kind: "system", key: "owner" }],
    isDeleted: true,
  });
  store.putRole({ id: "role-editor", tenantId: "org-a", permissions: ["core.unit.read", "core.unit.update"] });
  store.putRole({
    id: "role-odd",
    tenantId: "org-a",
    permissions: ["core.fake.read", "platform.user.read", "core.unit.read"],
  });
  store.putRole({ id: "role-gone", tenantId: "org-a", permissions: ["core.project.read"], isDeleted: true });
  store.putRole({ id: "role-device", tenantId: "org-a", permissions: ["core.project.read"] });
};

const seedDevices = (store: InMemoryAccessStore): void => {
  store.putDevice("dev-1", { tenantId: tenant("org-a"), status: "active" });
  store.putDevice("dev-revoked", { tenantId: tenant("org-a"), status: "revoked" });
  store.putDevice("dev-b", { tenantId: tenant("org-b"), status: "active" });
  store.putGrant({
    tenantId: "org-a",
    principalId: "dev-1",
    nodeId: "p1",
    roles: [{ kind: "custom", roleId: RoleIdSchema.parse("role-device") }],
  });
  store.putGrant({
    tenantId: "org-a",
    principalId: "dev-revoked",
    nodeId: "p1",
    roles: [{ kind: "custom", roleId: RoleIdSchema.parse("role-device") }],
  });
};

const seedApiKeys = (store: InMemoryAccessStore): void => {
  const key = (id: string, overrides: Partial<Parameters<InMemoryAccessStore["putApiKey"]>[1]> = {}) =>
    store.putApiKey(id, {
      tenantId: tenant("org-a"),
      ownerUid: UserIdSchema.parse("owner-a"),
      status: "active",
      expiresAt: LATER,
      scopes: ["core.project.read", "core.unit.read", "core.project.update"],
      node: nodes.p1,
      ...overrides,
    });
  key("key-1");
  key("key-expired", { expiresAt: EARLIER });
  key("key-now", { expiresAt: NOW });
  key("key-revoked", { status: "revoked" });
  key("key-u1a", { node: nodes.unit("u1a") });
  key("key-org", { node: nodes.orgA, scopes: ["core.organization.read"] });
  key("key-orphan", { ownerUid: UserIdSchema.parse("orphan-owner") });
  key("key-viewer", { ownerUid: UserIdSchema.parse("viewer-p1") });
  key("key-disabled-owner", { ownerUid: UserIdSchema.parse("disabled"), node: nodes.orgA });
  key("key-bad-expiry", { expiresAt: "not-a-date" });
  key("key-foreign-node", { node: nodes.pb });
};

const seedStaff = (store: InMemoryAccessStore): void => {
  store.putPlatformStaff("staff-admin", { role: "platform-admin", isActive: true });
  store.putPlatformStaff("staff-support", { role: "platform-support", isActive: true });
  store.putPlatformStaff("staff-off", { role: "platform-admin", isActive: false });
  store.putPlatformStaff("staff-disabled", { role: "platform-support", isActive: true });
  type SessionOverrides = { expiresAt?: string; endedAt?: string | null; tenantId?: string; staffUid?: string };
  const session = (id: string, targetUid: string, overrides: SessionOverrides = {}) =>
    store.putImpersonationSession(id, {
      staffUid: UserIdSchema.parse(overrides.staffUid ?? "staff-support"),
      targetUid: UserIdSchema.parse(targetUid),
      tenantId: tenant(overrides.tenantId ?? "org-a"),
      expiresAt: overrides.expiresAt ?? "2026-09-29T13:00:00.000Z",
      endedAt: overrides.endedAt ?? null,
    });
  session("imp-owner", "owner-a");
  session("imp-expired", "owner-a", { expiresAt: EARLIER });
  session("imp-ended", "owner-a", { endedAt: "2026-09-29T11:30:00.000Z" });
  session("imp-other-tenant", "owner-a", { tenantId: "org-b" });
  session("imp-other-target", "viewer-p1");
  session("imp-bad-expiry", "owner-a", { expiresAt: "not-a-date" });
  session("imp-by-staff-off", "owner-a", { staffUid: "staff-off" });
  session("imp-by-disabled-staff", "owner-a", { staffUid: "staff-disabled" });
  session("imp-by-non-staff", "owner-a", { staffUid: "viewer-p1" });
};

export type AccessWorld = {
  store: InMemoryAccessStore;
  registry: PermissionRegistry;
  clock: ReturnType<typeof fixedClock>;
};

/** Builds a fresh, fully seeded world. */
export const createAccessWorld = (): AccessWorld => {
  const store = createInMemoryAccessStore();
  seedTree(store);
  seedUsers(store);
  seedDevices(store);
  seedApiKeys(store);
  seedStaff(store);
  const registry = createPermissionRegistry([
    CORE_PERMISSION_SOURCE,
    { moduleId: "sample", permissions: [APPROVAL_PERMISSION] },
  ]);
  return { store, registry, clock: fixedClock(NOW) };
};
