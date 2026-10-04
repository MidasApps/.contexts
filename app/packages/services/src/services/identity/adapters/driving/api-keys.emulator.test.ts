import { OrganizationIdSchema, UserIdSchema } from "@core/contracts";
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
let tenantId = OrganizationIdSchema.parse("unset");
let now = new Date("2026-09-30T12:00:00.000Z");
const clock = { now: () => new Date(now.getTime()) };
const harness = buildEmulatorServer({ firebase, uids: ["ak-owner", "ak-admin"], clock });

type Created = { data?: { apiKey: { id: string; publicId: string }; secret: string }; error?: { code: string } };

const grant = (uid: string, key: "owner" | "admin") =>
  firestore.runTransaction(async (tx) => {
    const plan = await harness.server.accessServices.prepareGrant(tx, {
      tenantId,
      principal: { type: "user", id: uid },
      node: { level: "organization", tenantId },
      roles: [{ kind: "system", key }],
      grantedBy: UserIdSchema.parse("seed"),
      actor: { type: "system", id: "system" },
      requestId: "seed",
    });
    if (!plan.ok) throw plan.error;
    await plan.data.commit();
  });

const createKey = (scopes: readonly string[]) =>
  harness.call("identity.createApiKey", {
    method: "POST",
    path: `/v1/organizations/${tenantId}/api-keys`,
    as: "ak-admin",
    body: { name: "Export", scopes, node: { level: "organization", tenantId }, expiresAt: "2026-12-30T12:00:00.000Z" },
  });

// A request authenticated by the key itself (the pipeline routes `core_…` to the authenticator).
const withKey = (endpointId: string, path: string, key: string) => {
  const handler = harness.server.routes[endpointId];
  if (handler === undefined) throw new Error(`no handler for ${endpointId}`);
  return handler(
    new Request(`http://localhost${path}`, {
      headers: { authorization: `Bearer ${key}`, "x-forwarded-for": "198.51.100.7" },
    }),
  );
};

beforeEach(async () => {
  now = new Date("2026-09-30T12:00:00.000Z");
  await clearCoreCollections(firestore);
  for (const uid of ["ak-owner", "ak-admin"]) await ensureAuthUser(auth, uid);
  await seedActiveUser(firestore, "ak-admin");
  const created = await harness.call("tenancy.createOrganization", {
    method: "POST",
    path: "/v1/organizations",
    as: "ak-owner",
    body: { name: "Keys Inc", defaults: { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" } },
  });
  tenantId = OrganizationIdSchema.parse(((await created.json()) as { data: { id: string } }).data.id);
  await grant("ak-admin", "admin");
}, 30_000);

describe("API keys routes (emulator)", () => {
  it("returns the secret once, lists without it, and authenticates the key within its scopes", {
    timeout: 30_000,
  }, async () => {
    const response = await createKey(["core.organization.read"]);
    expect(response.status).toBe(201);
    const created = (await response.json()) as Created;
    const key = created.data?.secret ?? "";
    expect(response.headers.get("location")).toBe(`/v1/api-keys/${created.data?.apiKey.id}`);

    const listed = await harness.call("identity.listApiKeys", {
      method: "GET",
      path: `/v1/organizations/${tenantId}/api-keys`,
      as: "ak-admin",
    });
    const listedText = await listed.text();
    expect(listed.status).toBe(200);
    expect(listedText).toContain(created.data?.apiKey.publicId ?? "?");
    expect(listedText).not.toContain(key);
    expect(listedText).not.toContain("secretHash");
    const stored = (
      await firestore
        .collection(CORE_COLLECTIONS.apiKeys)
        .doc(created.data?.apiKey.id ?? "")
        .get()
    ).data();
    expect(JSON.stringify(stored)).not.toContain(key.split("_").slice(2).join("_"));

    const read = await withKey("tenancy.getOrganization", `/v1/organizations/${tenantId}`, key);
    expect(read.status).toBe(200);
    expect(((await read.json()) as { data: { name: string } }).data.name).toBe("Keys Inc");
    expect((await withKey("tenancy.listProjects", `/v1/organizations/${tenantId}/projects`, key)).status).toBe(403);
  });

  it("answers 401 once the owner is removed from the organization (keys revoked)", { timeout: 30_000 }, async () => {
    const key = ((await (await createKey(["core.organization.read"])).json()) as Created).data?.secret ?? "";
    const removed = await harness.call("access.removeMember", {
      method: "DELETE",
      path: `/v1/organizations/${tenantId}/members/ak-admin`,
      as: "ak-owner",
    });
    expect(removed.status).toBe(204);
    const keys = await firestore.collection(CORE_COLLECTIONS.apiKeys).where("ownerUid", "==", "ak-admin").get();
    expect(keys.docs.map((doc) => doc.data())).toMatchObject([{ status: "revoked", revokedReason: "owner-removed" }]);
    expect((await withKey("tenancy.getOrganization", `/v1/organizations/${tenantId}`, key)).status).toBe(401);
  });

  it("answers 401 after the key expires (clock) and 401 to a tampered secret", { timeout: 30_000 }, async () => {
    const key = ((await (await createKey(["core.organization.read"])).json()) as Created).data?.secret ?? "";
    expect(
      (
        await withKey(
          "tenancy.getOrganization",
          `/v1/organizations/${tenantId}`,
          `${key.slice(0, -1)}${key.endsWith("A") ? "B" : "A"}`,
        )
      ).status,
    ).toBe(401);
    now = new Date("2026-12-30T12:00:00.000Z");
    expect((await withKey("tenancy.getOrganization", `/v1/organizations/${tenantId}`, key)).status).toBe(401);
  });

  it("refuses scopes the creator does not hold (403 ESCALATION_FORBIDDEN)", { timeout: 30_000 }, async () => {
    const response = await createKey(["core.organization.delete"]);
    expect(response.status).toBe(403);
    expect(((await response.json()) as Created).error?.code).toBe("ESCALATION_FORBIDDEN");
  });
});
