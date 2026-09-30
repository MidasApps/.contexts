import { OrganizationIdSchema, UserIdSchema } from "@core/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import {
  buildEmulatorServer,
  clearCoreCollections,
  EMULATOR_APP_URL,
  emulatorFirebase,
  ensureAuthUser,
  seedActiveUser,
} from "../../../shared/testing/core-server-emulator.fixture.ts";

const firebase = emulatorFirebase();
const { firestore, auth } = firebase;
const tenantId = OrganizationIdSchema.parse("org-inv");
let now = new Date("2026-09-30T12:00:00.000Z");
const clock = { now: () => new Date(now.getTime()) };
const UIDS = ["inv-owner", "inv-carla", "inv-mallory"];
const harness = buildEmulatorServer({ firebase, uids: UIDS, clock });

type Body = { data?: Record<string, unknown> & { invitation?: { id: string }; acceptUrl?: string }; error?: { code: string } };
const body = async (response: Response) => (await response.json()) as Body;

const invite = (email = "Carla@Example.com") =>
  harness.call("access.createInvitation", {
    method: "POST",
    path: `/v1/organizations/${tenantId}/invitations`,
    as: "inv-owner",
    body: { email, node: { level: "organization", tenantId }, roles: [{ kind: "system", key: "member" }] },
  });

const tokenOf = (created: Body): string => created.data?.acceptUrl?.split("#token=")[1] ?? "";

const accept = (as: string, token: string) => harness.call("access.acceptInvitation", { method: "POST", path: "/v1/invitations/accept", as, body: { token } });

beforeEach(async () => {
  now = new Date("2026-09-30T12:00:00.000Z");
  await clearCoreCollections(firestore);
  await firestore.collection(CORE_COLLECTIONS.organizations).doc(tenantId).set({ tenantId, name: "Northwind", status: "active", deletedAt: null });
  await ensureAuthUser(auth, "inv-owner", { emailVerified: true });
  await ensureAuthUser(auth, "inv-carla", { email: "carla@example.com", emailVerified: true });
  await ensureAuthUser(auth, "inv-mallory", { email: "mallory@example.com", emailVerified: true });
  await seedActiveUser(firestore, "inv-owner");
  await firestore.runTransaction(async (tx) => {
    const plan = await harness.server.accessServices.prepareGrant(tx, {
      tenantId,
      principal: { type: "user", id: "inv-owner" },
      node: { level: "organization", tenantId },
      roles: [{ kind: "system", key: "owner" }],
      grantedBy: UserIdSchema.parse("seed"),
      actor: { type: "system", id: "system" },
      requestId: "seed",
    });
    if (!plan.ok) throw plan.error;
    await plan.data.commit();
  });
}, 30_000);

describe("invitations routes (emulator)", () => {
  it("creates (201 + accept link), lists without token or hash, previews, and accepts into a grant", { timeout: 30_000 }, async () => {
    const createdResponse = await invite();
    expect(createdResponse.status).toBe(201);
    const created = await body(createdResponse);
    const token = tokenOf(created);
    expect(created.data?.acceptUrl).toBe(`${EMULATOR_APP_URL}/invite#token=${token}`);
    expect(createdResponse.headers.get("location")).toBe(`/v1/invitations/${created.data?.invitation?.id}`);

    const listed = await harness.call("access.listInvitations", { method: "GET", path: `/v1/organizations/${tenantId}/invitations?status=pending`, as: "inv-owner" });
    const listedText = await listed.text();
    expect(listed.status).toBe(200);
    expect(listedText).toContain('"email":"carla@example.com"');
    expect(listedText).not.toContain(token);
    expect(listedText).not.toContain("tokenHash");

    const preview = await harness.call("access.previewInvitation", { method: "POST", path: "/v1/invitations/preview", as: "inv-carla", body: { token } });
    expect((await body(preview)).data).toMatchObject({ organizationName: "Northwind", inviterDisplayName: "inv-owner", maskedEmail: "c***@example.com" });

    const accepted = await accept("inv-carla", token);
    expect(accepted.status).toBe(200);
    expect((await body(accepted)).data).toEqual({ organizationId: tenantId });
    const grants = await firestore.collection(CORE_COLLECTIONS.memberships).where("principalId", "==", "inv-carla").get();
    expect(grants.docs.map((doc) => doc.data())).toMatchObject([{ tenantId, nodeId: tenantId, deletedAt: null }]);
    expect((await firestore.collection(CORE_COLLECTIONS.access).doc(`${tenantId}_inv-carla`).get()).data()).toMatchObject({ orgWide: true, isRevoked: false });
    expect((await firestore.collection(CORE_COLLECTIONS.users).doc("inv-carla").get()).data()).toMatchObject({ email: "carla@example.com", lastContext: { organizationId: tenantId } });
    expect((await auth.getUser("inv-carla")).customClaims).toMatchObject({ tenantId, accessVersion: 1 });
    const stored = (await firestore.collection(CORE_COLLECTIONS.invitations).doc(created.data?.invitation?.id ?? "").get()).data();
    expect(stored).toMatchObject({ status: "accepted", acceptedByUid: "inv-carla" });
    expect(stored?.["tokenHash"]).not.toBe(token);
  });

  it("answers 403 EMAIL_MISMATCH to another verified email, then 409 INVITATION_ALREADY_USED on reuse", { timeout: 30_000 }, async () => {
    const token = tokenOf(await body(await invite()));
    const mismatch = await accept("inv-mallory", token);
    expect(mismatch.status).toBe(403);
    expect((await body(mismatch)).error?.code).toBe("EMAIL_MISMATCH");

    expect((await accept("inv-carla", token)).status).toBe(200);
    const reuse = await accept("inv-carla", token);
    expect(reuse.status).toBe(409);
    expect((await body(reuse)).error?.code).toBe("INVITATION_ALREADY_USED");
  });

  it("answers 410 INVITATION_EXPIRED after 7 days (injected clock) and 404 once revoked", { timeout: 30_000 }, async () => {
    const expiring = tokenOf(await body(await invite()));
    const revocable = await body(await invite());
    now = new Date("2026-10-07T12:00:01.000Z");
    const expired = await accept("inv-carla", expiring);
    expect(expired.status).toBe(410);
    expect((await body(expired)).error?.code).toBe("INVITATION_EXPIRED");

    const revoked = await harness.call("access.revokeInvitation", { method: "DELETE", path: `/v1/invitations/${revocable.data?.invitation?.id}`, as: "inv-owner" });
    expect(revoked.status).toBe(204);
    expect((await accept("inv-carla", tokenOf(revocable))).status).toBe(404);
  });

  it("answers 404 to a stranger creating an invitation and 400 to a malformed token", { timeout: 30_000 }, async () => {
    await seedActiveUser(firestore, "inv-mallory");
    const stranger = await harness.call("access.createInvitation", {
      method: "POST",
      path: `/v1/organizations/${tenantId}/invitations`,
      as: "inv-mallory",
      body: { email: "x@example.com", node: { level: "organization", tenantId }, roles: [{ kind: "system", key: "member" }] },
    });
    expect(stranger.status).toBe(404);
    expect((await accept("inv-carla", "not-a-token")).status).toBe(400);
  });
});
