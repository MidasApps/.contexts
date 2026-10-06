import { OrganizationIdSchema, UserIdSchema } from "@core/contracts";
import { FieldValue } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "#/services/shared/clock/clock.ts";
import { CORE_COLLECTIONS } from "#/services/shared/firestore/collections.ts";
import {
  buildEmulatorServer,
  clearCoreCollections,
  emulatorFirebase,
  ensureAuthUser,
  seedActiveUser,
} from "#/services/shared/testing/core-server-emulator.fixture.ts";

const firebase = emulatorFirebase();
const { firestore, auth } = firebase;
// One instant for the whole file: the 10-per-minute switch budget stays in one window.
const harness = buildEmulatorServer({
  firebase,
  uids: ["me-founder", "me-outsider", "me-member"],
  clock: fixedClock("2026-09-30T12:00:00.000Z"),
});
const DEFAULTS = { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" };

type Body = { data?: Record<string, unknown> & { id?: string }; error?: { code: string } };
const body = async (response: Response) => (await response.json()) as Body;

const createOrganization = async (name: string): Promise<string> => {
  const response = await harness.call("tenancy.createOrganization", {
    method: "POST",
    path: "/v1/organizations",
    as: "me-founder",
    body: { name, defaults: DEFAULTS },
  });
  const id = (await body(response)).data?.id;
  if (response.status !== 201 || id === undefined) throw new Error(`organization not created: ${response.status}`);
  return id;
};

const switchTo = (organizationId: string, as = "me-founder") =>
  harness.call("identity.setActiveOrganization", {
    method: "PUT",
    path: "/v1/me/active-organization",
    as,
    body: { organizationId },
  });

// What `getIdToken(true)` does: a fresh ID token from the Auth Emulator's REST API.
const freshIdTokenClaims = async (uid: string): Promise<Record<string, unknown>> => {
  const customToken = await auth.createCustomToken(uid);
  const host = process.env["FIREBASE_AUTH_EMULATOR_HOST"] ?? "";
  const response = await fetch(
    `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const { idToken } = (await response.json()) as { idToken: string };
  return { ...(await auth.verifyIdToken(idToken)) };
};

beforeEach(async () => {
  await clearCoreCollections(firestore);
  await ensureAuthUser(auth, "me-founder");
  await ensureAuthUser(auth, "me-outsider");
  await ensureAuthUser(auth, "me-member");
  await auth.setCustomUserClaims("me-member", null);
  await auth.setCustomUserClaims("me-founder", null);
}, 30_000);

describe("me routes (emulator)", () => {
  it("creates the users doc on the first GET /me; PATCH validates the IANA time zone", {
    timeout: 30_000,
  }, async () => {
    expect((await firestore.collection(CORE_COLLECTIONS.users).doc("me-outsider").get()).exists).toBe(false);
    const first = await harness.call("identity.getMe", { method: "GET", path: "/v1/me", as: "me-outsider" });
    expect(first.status).toBe(200);
    expect((await body(first)).data).toMatchObject({
      uid: "me-outsider",
      email: "me-outsider@example.com",
      accessVersion: 0,
      isPlatformStaff: false,
      mfaEnrolled: false,
    });
    expect((await firestore.collection(CORE_COLLECTIONS.users).doc("me-outsider").get()).data()).toMatchObject({
      email: "me-outsider@example.com",
      status: "active",
      schemaVersion: 1,
    });
    // The searchable name is stored with the profile (decision 0044); the Auth name here is the uid's.
    expect(typeof (await firestore.collection(CORE_COLLECTIONS.users).doc("me-outsider").get()).get("searchName")).toBe(
      "string",
    );
    expect((await harness.call("identity.getMe", { method: "GET", path: "/v1/me", as: "me-outsider" })).status).toBe(
      200,
    );

    const invalid = await harness.call("identity.updateMe", {
      method: "PATCH",
      path: "/v1/me",
      as: "me-outsider",
      body: { preferences: { timeZone: "Mars/Olympus_Mons" } },
    });
    expect(invalid.status).toBe(400);
    expect((await body(invalid)).error?.code).toBe("VALIDATION_FAILED");
    const valid = await harness.call("identity.updateMe", {
      method: "PATCH",
      path: "/v1/me",
      as: "me-outsider",
      body: { displayName: "Out Sider", preferences: { timeZone: "America/Recife" } },
    });
    expect((await body(valid)).data).toMatchObject({
      displayName: "Out Sider",
      preferences: { timeZone: "America/Recife" },
    });
    // The searchable name follows the display name (decision 0044).
    expect((await firestore.collection(CORE_COLLECTIONS.users).doc("me-outsider").get()).get("searchName")).toBe(
      "out sider",
    );
  });

  it("switches the active organization (204) and the next ID token carries its tenantId", {
    timeout: 30_000,
  }, async () => {
    const first = await createOrganization("First");
    // `createOrganization` creates the founder's users doc with its searchable name (decision 0044).
    expect((await firestore.collection(CORE_COLLECTIONS.users).doc("me-founder").get()).get("searchName")).toEqual(
      expect.any(String),
    );
    await createOrganization("Second");
    expect((await freshIdTokenClaims("me-founder"))["tenantId"]).toBe(first);

    const second = (
      await body(
        await harness.call("identity.listMyOrganizations", {
          method: "GET",
          path: "/v1/me/organizations",
          as: "me-founder",
        }),
      )
    ).data as unknown as { id: string; name: string }[];
    const target = second.find((organization) => organization.name === "Second")?.id ?? "";
    expect(second.map((organization) => organization.name).sort()).toEqual(["First", "Second"]);

    expect((await switchTo(target)).status).toBe(204);
    expect((await freshIdTokenClaims("me-founder"))["tenantId"]).toBe(target);
    expect(
      (await firestore.collection(CORE_COLLECTIONS.users).doc("me-founder").get()).data()?.["lastContext"],
    ).toEqual({ organizationId: target });

    await seedActiveUser(firestore, "me-outsider");
    expect((await switchTo(target, "me-outsider")).status).toBe(404);
  });

  it("lets a project-only member switch (204, decision 0030 A5); its token carries the tenantId", {
    timeout: 30_000,
  }, async () => {
    const organizationId = OrganizationIdSchema.parse(await createOrganization("Projects only"));
    const project = await harness.call("tenancy.createProject", {
      method: "POST",
      path: `/v1/organizations/${organizationId}/projects`,
      as: "me-founder",
      body: { name: "Alpha" },
    });
    const projectId = (await body(project)).data?.id ?? "";
    expect(project.status).toBe(201);
    // A full users doc (preferences included), as the first GET /v1/me of a real client creates it.
    expect((await harness.call("identity.getMe", { method: "GET", path: "/v1/me", as: "me-member" })).status).toBe(200);
    await firestore.runTransaction(async (tx) => {
      const plan = await harness.server.accessServices.prepareGrant(tx, {
        tenantId: organizationId,
        principal: { type: "user", id: "me-member" },
        node: { level: "project", tenantId: organizationId, projectId } as never,
        roles: [{ kind: "system", key: "viewer" }],
        grantedBy: UserIdSchema.parse("seed"),
        actor: { type: "system", id: "system" },
        requestId: "seed",
      });
      if (!plan.ok) throw plan.error;
      await plan.data.commit();
    });

    const listed = (
      await body(
        await harness.call("identity.listMyOrganizations", {
          method: "GET",
          path: "/v1/me/organizations",
          as: "me-member",
        }),
      )
    ).data as unknown as { id: string }[];
    expect(listed.map((organization) => organization.id)).toEqual([organizationId]);
    expect((await switchTo(organizationId, "me-member")).status).toBe(204);
    expect((await freshIdTokenClaims("me-member"))["tenantId"]).toBe(organizationId);
    // Switching grants nothing: the organization-level context stays hidden.
    const context = await harness.call("identity.getAccessContext", {
      method: "GET",
      path: `/v1/me/context?organizationId=${organizationId}`,
      as: "me-member",
    });
    expect(context.status).toBe(404);
    const projectContext = await harness.call("identity.getAccessContext", {
      method: "GET",
      path: `/v1/me/context?organizationId=${organizationId}&projectId=${projectId}`,
      as: "me-member",
    });
    expect(projectContext.status).toBe(200);

    await seedActiveUser(firestore, "me-outsider");
    expect((await switchTo(organizationId, "me-outsider")).status).toBe(404);

    // Its only grant now sits on a deleted project: the organization is no longer listed.
    const deleted = await harness.call("tenancy.deleteProject", {
      method: "DELETE",
      path: `/v1/projects/${projectId}`,
      as: "me-founder",
    });
    expect(deleted.status).toBe(204);
    const afterDelete = (
      await body(
        await harness.call("identity.listMyOrganizations", {
          method: "GET",
          path: "/v1/me/organizations",
          as: "me-member",
        }),
      )
    ).data as unknown as unknown[];
    expect(afterDelete).toEqual([]);
  });

  it("lists the grant nodes of a unit-only member (GET /me/grants, follow-up #33)", { timeout: 30_000 }, async () => {
    const organizationId = OrganizationIdSchema.parse(await createOrganization("Units only"));
    const project = await harness.call("tenancy.createProject", {
      method: "POST",
      path: `/v1/organizations/${organizationId}/projects`,
      as: "me-founder",
      body: { name: "Alpha" },
    });
    const projectId = (await body(project)).data?.id ?? "";
    const unit = await harness.call("tenancy.createUnit", {
      method: "POST",
      path: `/v1/projects/${projectId}/units`,
      as: "me-founder",
      body: { name: "Room", type: "core.unit", parentUnitId: null },
    });
    const unitId = (await body(unit)).data?.id ?? "";
    expect(unit.status).toBe(201);
    expect((await harness.call("identity.getMe", { method: "GET", path: "/v1/me", as: "me-member" })).status).toBe(200);
    const unitNode = { level: "unit", tenantId: organizationId, projectId, unitId };
    await firestore.runTransaction(async (tx) => {
      const plan = await harness.server.accessServices.prepareGrant(tx, {
        tenantId: organizationId,
        principal: { type: "user", id: "me-member" },
        node: unitNode as never,
        roles: [{ kind: "system", key: "member" }],
        grantedBy: UserIdSchema.parse("seed"),
        actor: { type: "system", id: "system" },
        requestId: "seed",
      });
      if (!plan.ok) throw plan.error;
      await plan.data.commit();
    });

    const grants = await harness.call("identity.listMyGrants", {
      method: "GET",
      path: `/v1/me/grants?organizationId=${organizationId}`,
      as: "me-member",
    });
    expect(grants.status).toBe(200);
    expect(await grants.json()).toEqual({
      data: [{ node: unitNode, roles: [{ kind: "system", key: "member" }] }],
      meta: { page: { cursor: null, hasMore: false, limit: 20 } },
    });
    // The founder sees only its own organization grant; an outsider gets 404; the query is validated.
    const founder = (
      await body(
        await harness.call("identity.listMyGrants", {
          method: "GET",
          path: `/v1/me/grants?organizationId=${organizationId}`,
          as: "me-founder",
        }),
      )
    ).data as unknown as { node: { level: string } }[];
    expect(founder.map((grant) => grant.node.level)).toEqual(["organization"]);
    await seedActiveUser(firestore, "me-outsider");
    expect(
      (
        await harness.call("identity.listMyGrants", {
          method: "GET",
          path: `/v1/me/grants?organizationId=${organizationId}`,
          as: "me-outsider",
        })
      ).status,
    ).toBe(404);
    expect(
      (await harness.call("identity.listMyGrants", { method: "GET", path: "/v1/me/grants", as: "me-member" })).status,
    ).toBe(400);
  });

  it("answers 429 with Retry-After on the 11th switch in a minute", { timeout: 60_000 }, async () => {
    const organizationId = await createOrganization("Busy");
    for (let attempt = 1; attempt <= 10; attempt += 1) expect((await switchTo(organizationId)).status).toBe(204);
    const limited = await switchTo(organizationId);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("heals stale claims after a direct membership change (POST /me/claims/sync)", { timeout: 30_000 }, async () => {
    const organizationId = OrganizationIdSchema.parse(await createOrganization("Direct"));
    await firestore
      .collection(CORE_COLLECTIONS.projects)
      .doc("me-p1")
      .set({ tenantId: organizationId, name: "P", status: "active", settings: {}, deletedAt: null });
    // A grant written without the post-commit sync: the claims keep the old accessVersion.
    await firestore.runTransaction(async (tx) => {
      const plan = await harness.server.accessServices.prepareGrant(tx, {
        tenantId: organizationId,
        principal: { type: "user", id: "me-founder" },
        node: { level: "project", tenantId: organizationId, projectId: "me-p1" } as never,
        roles: [{ kind: "system", key: "viewer" }],
        grantedBy: UserIdSchema.parse("seed"),
        actor: { type: "system", id: "system" },
        requestId: "seed",
      });
      if (!plan.ok) throw plan.error;
      await plan.data.commit();
    });
    expect((await auth.getUser("me-founder")).customClaims?.["accessVersion"]).toBe(1);

    const synced = await harness.call("identity.syncClaims", {
      method: "POST",
      path: "/v1/me/claims/sync",
      as: "me-founder",
    });
    expect(synced.status).toBe(204);
    expect((await auth.getUser("me-founder")).customClaims).toMatchObject({
      accessVersion: 2,
      tenantId: organizationId,
    });
  });

  it("resolves the access context of a member (200) and hides the node from an outsider (404)", {
    timeout: 30_000,
  }, async () => {
    const organizationId = await createOrganization("Context");
    const context = await harness.call("identity.getAccessContext", {
      method: "GET",
      path: `/v1/me/context?organizationId=${organizationId}`,
      as: "me-founder",
    });
    expect(context.status).toBe(200);
    const data = (await body(context)).data as {
      permissions: string[];
      regional: unknown;
      organization: { name: string };
    };
    expect(data.organization.name).toBe("Context");
    expect(data.permissions).toContain("core.organization.delete");
    expect(data.regional).toEqual({
      locale: "pt-BR",
      displayTimeZone: "America/Sao_Paulo",
      nodeTimeZone: "America/Sao_Paulo",
      currency: "BRL",
    });

    await seedActiveUser(firestore, "me-outsider");
    const hidden = await harness.call("identity.getAccessContext", {
      method: "GET",
      path: `/v1/me/context?organizationId=${organizationId}`,
      as: "me-outsider",
    });
    expect(hidden.status).toBe(404);
  });

  it("resolves the access context with default preferences when the users doc lacks them", {
    timeout: 30_000,
  }, async () => {
    const organizationId = await createOrganization("No preferences");
    await firestore.collection(CORE_COLLECTIONS.users).doc("me-founder").update({ preferences: FieldValue.delete() });

    const context = await harness.call("identity.getAccessContext", {
      method: "GET",
      path: `/v1/me/context?organizationId=${organizationId}`,
      as: "me-founder",
    });

    expect(context.status).toBe(200);
    expect((await body(context)).data?.["regional"]).toEqual({
      locale: "pt-BR",
      displayTimeZone: "America/Sao_Paulo",
      nodeTimeZone: "America/Sao_Paulo",
      currency: "BRL",
    });
  });
});
