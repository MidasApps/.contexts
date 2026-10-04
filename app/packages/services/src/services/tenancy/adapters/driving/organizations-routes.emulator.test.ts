import { beforeEach, describe, expect, it } from "vitest";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import {
  buildEmulatorServer,
  clearCoreCollections,
  emulatorFirebase,
  ensureAuthUser,
  seedActiveUser,
} from "../../../shared/testing/core-server-emulator.fixture.ts";

const firebase = emulatorFirebase();
const { firestore, auth } = firebase;
const harness = buildEmulatorServer({ firebase, uids: ["founder", "outsider"] });
const closed = buildEmulatorServer({ firebase, uids: ["founder"], selfServe: false });

const DEFAULTS = { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" };
type Body = { data?: Record<string, unknown>; error?: { code: string } };
const body = async (response: Response) => (await response.json()) as Body;

const createOrganization = (as = "founder", server = harness) =>
  server.call("tenancy.createOrganization", {
    method: "POST",
    path: "/v1/organizations",
    as,
    body: { name: "Northwind", defaults: DEFAULTS },
  });

beforeEach(async () => {
  await clearCoreCollections(firestore);
  await Promise.all([ensureAuthUser(auth, "founder"), ensureAuthUser(auth, "outsider")]);
});

describe("organizations routes (emulator)", () => {
  it("creates an organization (201 + Location) that its owner can read; the users doc and claims follow", async () => {
    const created = await createOrganization();
    expect(created.status).toBe(201);
    const organization = (await body(created)).data as { id: string; tenantId: string };
    expect(created.headers.get("location")).toBe(`/v1/organizations/${organization.id}`);
    expect(organization.tenantId).toBe(organization.id);

    const read = await harness.call("tenancy.getOrganization", {
      method: "GET",
      path: `/v1/organizations/${organization.id}`,
      as: "founder",
    });
    expect(read.status).toBe(200);
    expect((await body(read)).data).toMatchObject({ name: "Northwind", status: "active", defaults: DEFAULTS });

    const user = (await firestore.collection(CORE_COLLECTIONS.users).doc("founder").get()).data();
    expect(user).toMatchObject({
      email: "founder@example.com",
      status: "active",
      accessVersion: 1,
      lastContext: { organizationId: organization.id },
    });
    expect((await auth.getUser("founder")).customClaims).toMatchObject({ tenantId: organization.id, accessVersion: 1 });
    const audit = await firestore.collection("audit-logs").where("tenantId", "==", organization.id).get();
    expect(audit.docs.map((doc) => doc.data()["action"] as string).sort()).toEqual([
      "MEMBERSHIP_GRANTED",
      "ORGANIZATION_CREATED",
    ]);
  });

  it("answers 404 to an outsider", async () => {
    const organization = (await body(await createOrganization())).data as { id: string };
    await seedActiveUser(firestore, "outsider");
    const read = await harness.call("tenancy.getOrganization", {
      method: "GET",
      path: `/v1/organizations/${organization.id}`,
      as: "outsider",
    });
    expect(read.status).toBe(404);
    expect((await body(read)).error?.code).toBe("NOT_FOUND");
  });

  it("answers 403 when self-serve is off and the caller is not staff", async () => {
    const refused = await createOrganization("founder", closed);
    expect(refused.status).toBe(403);
    expect((await body(refused)).error?.code).toBe("FORBIDDEN");
  });

  it("deletes (204): the organization is gone and every projection of the tenant is revoked", async () => {
    const organization = (await body(await createOrganization())).data as { id: string };
    const deleted = await harness.call("tenancy.deleteOrganization", {
      method: "DELETE",
      path: `/v1/organizations/${organization.id}`,
      as: "founder",
    });
    expect(deleted.status).toBe(204);

    const projections = await firestore
      .collection(CORE_COLLECTIONS.access)
      .where("tenantId", "==", organization.id)
      .get();
    expect(projections.size).toBe(1);
    expect(projections.docs.every((doc) => doc.data()["isRevoked"] === true)).toBe(true);
    const read = await harness.call("tenancy.getOrganization", {
      method: "GET",
      path: `/v1/organizations/${organization.id}`,
      as: "founder",
    });
    expect(read.status).toBe(404);
  });

  it("updates the regional defaults (200) and lists projects the owner creates", async () => {
    const organization = (await body(await createOrganization())).data as { id: string };
    const updated = await harness.call("tenancy.updateOrganization", {
      method: "PATCH",
      path: `/v1/organizations/${organization.id}`,
      as: "founder",
      body: { defaults: { currency: "USD" } },
    });
    expect((await body(updated)).data).toMatchObject({ defaults: { ...DEFAULTS, currency: "USD" } });

    for (const name of ["Beta", "Alpha"]) {
      const project = await harness.call("tenancy.createProject", {
        method: "POST",
        path: `/v1/organizations/${organization.id}/projects`,
        as: "founder",
        body: { name },
      });
      expect(project.status).toBe(201);
    }
    const listed = await harness.call("tenancy.listProjects", {
      method: "GET",
      path: `/v1/organizations/${organization.id}/projects?limit=1`,
      as: "founder",
    });
    const page = (await listed.json()) as {
      data: { name: string }[];
      meta: { page: { cursor: string | null; hasMore: boolean } };
    };
    expect(page.data.map((project) => project.name)).toEqual(["Alpha"]);
    expect(page.meta.page.hasMore).toBe(true);
    const next = await harness.call("tenancy.listProjects", {
      method: "GET",
      path: `/v1/organizations/${organization.id}/projects?limit=1&cursor=${page.meta.page.cursor ?? ""}`,
      as: "founder",
    });
    expect(((await next.json()) as { data: { name: string }[] }).data.map((project) => project.name)).toEqual(["Beta"]);
  });
});
