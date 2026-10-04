import { OrganizationIdSchema, UserIdSchema } from "@core/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { AUDIT_LOG_COLLECTIONS } from "../../../audit/adapters/driven/firestore-audit-log-writer.ts";
import { createCoreServer } from "../../../composition.ts";
import { createLogger, type LogRecord } from "../../../shared/observability/logger.ts";
import { signInWithCustomToken, signInWithPasswordAndSms } from "../../../shared/testing/auth-emulator-rest.fixture.ts";
import {
  buildEmulatorServer,
  clearCoreCollections,
  EMULATOR_APP_URL,
  emulatorFirebase,
  ensureAuthUser,
  seedActiveUser,
} from "../../../shared/testing/core-server-emulator.fixture.ts";

const STAFF = { uid: "imp-staff", email: "imp-staff@example.com", password: "correct-horse-battery" };
const OWNER = "imp-owner";
const REASON = "Ticket 4821: user cannot see project Launch.";
const START = new Date("2026-09-30T12:00:00.000Z");

let now = new Date(START);
const clock = { now: () => new Date(now.getTime()) };
const firebase = emulatorFirebase();
const { firestore, auth } = firebase;
// The owner and the MFA-less staff call use the fake verifier (`token-<uid>`); the staff's
// SMS sign-in and the impersonated token go through the real one (Auth Emulator).
const harness = buildEmulatorServer({ firebase, uids: [OWNER, STAFF.uid], clock });
const logs: LogRecord[] = [];
const real = createCoreServer({
  env: { API_KEY_PREFIX: "core", NEXT_PUBLIC_APP_URL: EMULATOR_APP_URL },
  firebase,
  clock,
  logger: createLogger({ context: { service: "test", env: "local" }, sink: (record) => logs.push(record) }),
});
let tenantId = OrganizationIdSchema.parse("unset");

const callReal = (endpointId: string, path: string, init: { method?: string; bearer: string; body?: unknown }) => {
  const handler = real.routes[endpointId];
  if (handler === undefined) throw new Error(`no handler for ${endpointId}`);
  const headers = { "content-type": "application/json", authorization: `Bearer ${init.bearer}` };
  return handler(
    new Request(`http://localhost${path}`, {
      method: init.method ?? "GET",
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    }),
  );
};

// Admin SDK enrollment of an SMS factor: what the user does once in SP2's security settings.
const recreateStaffWithSms = async (): Promise<void> => {
  await auth.deleteUser(STAFF.uid).catch(() => undefined);
  await auth.createUser({
    uid: STAFF.uid,
    email: STAFF.email,
    password: STAFF.password,
    emailVerified: true,
    multiFactor: { enrolledFactors: [{ factorId: "phone", phoneNumber: "+15555550100", displayName: "Work phone" }] },
  });
};

const auditEntries = async (collection: string) =>
  (await firestore.collection(collection).get()).docs.map(
    (doc) => doc.data() as { action: string; actor: { id: string; onBehalfOf?: string }; outcome: string },
  );

beforeEach(async () => {
  now = new Date(START);
  logs.length = 0;
  await clearCoreCollections(firestore);
  await ensureAuthUser(auth, OWNER);
  await recreateStaffWithSms();
  await seedActiveUser(firestore, STAFF.uid);
  await real.platform.grantPlatformStaff({
    uid: UserIdSchema.parse(STAFF.uid),
    role: "platform-support",
    requestId: "seed",
  });
  const created = await harness.call("tenancy.createOrganization", {
    method: "POST",
    path: "/v1/organizations",
    as: OWNER,
    body: { name: "Support Target Inc", defaults: { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" } },
  });
  tenantId = OrganizationIdSchema.parse(((await created.json()) as { data: { id: string } }).data.id);
}, 30_000);

describe("impersonation (Auth Emulator, SMS MFA)", () => {
  it("lets MFA staff read as the user, refuses writes, stops at expiry and audits both logs", {
    timeout: 90_000,
  }, async () => {
    const staffSignIn = await signInWithPasswordAndSms({
      email: STAFF.email,
      password: STAFF.password,
      projectId: "demo-core",
    });
    expect((await auth.verifyIdToken(staffSignIn.idToken)).firebase.sign_in_second_factor).toBe("phone");
    const started = await callReal("identity.startImpersonation", "/v1/platform/impersonation-sessions", {
      method: "POST",
      bearer: staffSignIn.idToken,
      body: { targetUid: OWNER, organizationId: tenantId, reason: REASON, durationMinutes: 30 },
    });
    expect(started.status).toBe(201);
    const { data } = (await started.json()) as { data: { sessionId: string; customToken: string; expiresAt: string } };
    expect(started.headers.get("location")).toBe(`/v1/platform/impersonation-sessions/${data.sessionId}`);
    expect(data.expiresAt).toBe("2026-09-30T12:30:00.000Z");
    const { idToken } = await signInWithCustomToken(data.customToken);
    expect(await auth.verifyIdToken(idToken)).toMatchObject({ uid: OWNER, imp: data.sessionId, impBy: STAFF.uid });

    const organizationPath = `/v1/organizations/${tenantId}`;
    expect((await callReal("tenancy.getOrganization", organizationPath, { bearer: idToken })).status).toBe(200);
    const patched = await callReal("tenancy.updateOrganization", organizationPath, {
      method: "PATCH",
      bearer: idToken,
      body: { name: "Hijacked" },
    });
    expect(patched.status).toBe(403);
    const patchedBody = JSON.stringify(await patched.json());
    expect(patchedBody).toContain('"FORBIDDEN"');
    expect(patchedBody).not.toContain("IMPERSONATION");
    expect(logs.find((record) => record.message === "access_denied")).toMatchObject({
      endpointId: "tenancy.updateOrganization",
      reason: "IMPERSONATION_READ_ONLY",
    });

    now = new Date("2026-09-30T12:30:00.000Z");
    expect((await callReal("tenancy.getOrganization", organizationPath, { bearer: idToken })).status).toBe(403);

    for (const collection of Object.values(AUDIT_LOG_COLLECTIONS)) {
      const entries = await auditEntries(collection);
      const onBehalf = entries.filter((entry) => entry.actor.onBehalfOf === STAFF.uid).map((entry) => entry.action);
      expect(onBehalf).toEqual(expect.arrayContaining(["IMPERSONATED_REQUEST_SERVED", "IMPERSONATED_WRITE_DENIED"]));
      expect(entries.map((entry) => entry.action)).toContain("IMPERSONATION_STARTED");
    }
    const endPath = `/v1/platform/impersonation-sessions/${data.sessionId}/end`;
    expect(
      (await callReal("identity.endImpersonation", endPath, { method: "POST", bearer: staffSignIn.idToken })).status,
    ).toBe(204);
    expect(
      (await callReal("identity.endImpersonation", endPath, { method: "POST", bearer: staffSignIn.idToken })).status,
    ).toBe(204);
  });

  it("answers 403 MFA_REQUIRED to staff signed in without a second factor, and audits the refusal", {
    timeout: 60_000,
  }, async () => {
    const response = await harness.call("identity.startImpersonation", {
      method: "POST",
      path: "/v1/platform/impersonation-sessions",
      as: STAFF.uid,
      body: { targetUid: OWNER, organizationId: tenantId, reason: REASON },
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("MFA_REQUIRED");
    const denied = (await auditEntries(AUDIT_LOG_COLLECTIONS.platform)).filter(
      (entry) => entry.action === "PLATFORM_ACCESS_DENIED",
    );
    expect(denied).toMatchObject([{ outcome: "denied", actor: { id: STAFF.uid } }]);
  });
});
