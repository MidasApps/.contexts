import type { PermissionDefinition } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { fixedClock } from "./shared/clock/clock.ts";
import type { FirebaseAdmin } from "./shared/firebase/firebase-admin.ts";
import { createLogger } from "./shared/observability/logger.ts";
import { createInMemoryAccessStore } from "./access/adapters/driven/in-memory-access-store.ts";
import { createCoreServer } from "./composition.ts";

// Adapters only keep references at construction; nothing here reaches Firebase.
const firebase = { app: {}, auth: {}, firestore: {} } as unknown as FirebaseAdmin;
const logger = createLogger({ context: { service: "test", env: "local" }, sink: () => undefined });

const samplePermission: PermissionDefinition = {
  id: "sample.invoice.read",
  descriptionKey: "permissions.sample.invoice.read",
  kind: "read",
  scope: "tenant",
  defaultRoles: ["member"],
};

const build = () =>
  createCoreServer({
    env: { API_KEY_PREFIX: "core" },
    firebase,
    logger,
    clock: fixedClock("2026-09-29T12:00:00.000Z"),
    modules: [{ id: "sample", permissions: [samplePermission], unitTypes: [{ id: "sample.site", labelKey: "sample.unitTypes.site", allowedParents: ["project"] }] }],
  });

describe("createCoreServer", () => {
  it("registers module permissions next to the core catalog", () => {
    const server = build();
    expect(server.access.registry.get("sample.invoice.read")).toMatchObject({ kind: "read" });
    expect(server.access.registry.get("core.project.read")).toBeDefined();
  });

  it("registers the handlers of the verticals built so far", () => {
    expect(Object.keys(build().routes)).toEqual(
      expect.arrayContaining(["access.listPermissions", "access.listRoles", "access.createRole", "access.getRole", "access.updateRole", "access.deleteRole"]),
    );
    expect(Object.keys(build().routes)).toEqual(
      expect.arrayContaining([
        "tenancy.createOrganization",
        "tenancy.getOrganization",
        "tenancy.updateOrganization",
        "tenancy.deleteOrganization",
        "tenancy.listProjects",
        "tenancy.createProject",
        "tenancy.getProject",
        "tenancy.updateProject",
        "tenancy.deleteProject",
        "tenancy.listUnits",
        "tenancy.createUnit",
        "tenancy.getUnit",
        "tenancy.updateUnit",
        "tenancy.deleteUnit",
        "tenancy.listUnitTypes",
      ]),
    );
    expect(Object.keys(build().routes)).toEqual(
      expect.arrayContaining([
        "access.listMembers",
        "access.removeMember",
        "access.listMemberships",
        "access.grantMembership",
        "access.updateMembership",
        "access.revokeMembership",
        "access.listInvitations",
        "access.createInvitation",
        "access.revokeInvitation",
        "access.previewInvitation",
        "access.acceptInvitation",
      ]),
    );
    expect(Object.keys(build().routes)).toEqual(
      expect.arrayContaining([
        "identity.getMe",
        "identity.updateMe",
        "identity.setActiveOrganization",
        "identity.syncClaims",
        "identity.listMyOrganizations",
        "identity.getAccessContext",
      ]),
    );
  });

  it("registers the unit types of the installed modules", () => {
    expect(build().tenancy.unitTypes.list().map((type) => type.id)).toEqual(["sample.site"]);
  });

  it("refuses API keys until their authenticator is wired, without touching Firebase", async () => {
    expect(await build().verifyBearer({ token: "core_PUBLIC_secret", checkRevoked: true })).toBeNull();
  });

  it("decides with the access readers it is given (Firestore by default)", async () => {
    const store = createInMemoryAccessStore();
    store.putOrganization({ id: "org-a" });
    store.putUser("u1");
    const server = createCoreServer({ env: { API_KEY_PREFIX: "core" }, firebase, logger, adapters: { accessReaders: store } });
    const decision = await server.access.forRequest().authorize({
      principal: { type: "user", uid: "u1", mfa: false } as never,
      permission: "core.project.read",
      node: { level: "organization", tenantId: "org-a" } as never,
    });
    expect(decision).toEqual({ allowed: false, reason: "NOT_A_MEMBER" });
  });
});
