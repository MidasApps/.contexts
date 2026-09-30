import { createServer } from "node:net";
import { createFirebaseAdmin } from "@core/services";
import { Mastra } from "@mastra/core/mastra";
import { MASTRA_RESOURCE_ID_KEY } from "@mastra/core/request-context";
import { registerApiRoute } from "@mastra/core/server";
import { createNodeServer } from "@mastra/deployer/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AccessPort } from "../runtime/runtime-ports.ts";
import { createFakeAccessPort } from "../testing/fake-ports.ts";
import type { AgentPrincipal } from "./agent-principal.ts";
import { FirebaseMastraAuth } from "./firebase-mastra-auth.ts";

// Runs inside `firebase emulators:exec` (root `pnpm test:emulators`), which exports
// FIREBASE_AUTH_EMULATOR_HOST. Real ID tokens from the Auth Emulator, verified by
// firebase-admin; memberships come from the fake access port.
const { auth: adminAuth } = createFirebaseAdmin({ env: { APP_ENV: "local", FIREBASE_PROJECT_ID: "demo-core" }, processEnv: process.env });
const TENANT = "EmuTenant0000000001";

const signUp = async (label: string): Promise<{ uid: string; idToken: string }> => {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (host === undefined) throw new Error("FIREBASE_AUTH_EMULATOR_HOST is not set; run through pnpm test:emulators");
  const email = `${label}-${Date.now()}@example.test`;
  const response = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "secret-password", returnSecureToken: true }),
  });
  const body = (await response.json()) as { localId: string; idToken: string };
  return { uid: body.localId, idToken: body.idToken };
};

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });

/** Binds `verifyBearer` to firebase-admin, as `create-runtime-ports.ts` will. */
const firebaseVerifyBearer: AccessPort["verifyBearer"] = async ({ token, checkRevoked }) => {
  try {
    const decoded = await adminAuth.verifyIdToken(token, checkRevoked);
    return { type: "user", uid: decoded.uid, mfa: false };
  } catch {
    // Invalid, expired or revoked token: the provider answers 401.
    return null;
  }
};

let baseUrl = "";
let closeServer: () => Promise<void> = () => Promise.resolve();
let member = { uid: "", idToken: "" };
let viewer = { uid: "", idToken: "" };
let outsider = { uid: "", idToken: "" };

beforeAll(async () => {
  [member, viewer, outsider] = await Promise.all([signUp("member"), signUp("viewer"), signUp("outsider")]);
  const access = {
    ...createFakeAccessPort({
      memberships: [
        { tenantId: TENANT, uid: member.uid, permissions: ["core.chat.use"] },
        { tenantId: TENANT, uid: viewer.uid, permissions: ["core.knowledge.read"] },
      ],
    }),
    verifyBearer: firebaseVerifyBearer,
  };
  const port = await freePort();
  const whoami = registerApiRoute("/probe/whoami", {
    method: "GET",
    handler: (c) => {
      const context = c.get("requestContext");
      const user = context.get<"user", AgentPrincipal>("user");
      return c.json({ uid: user.uid, tenantId: user.tenantId, resourceId: context.get(MASTRA_RESOURCE_ID_KEY) });
    },
  });
  const mastra = new Mastra({ server: { port, host: "127.0.0.1", auth: new FirebaseMastraAuth({ access }), apiRoutes: [whoami] } });
  const server = await createNodeServer(mastra, { tools: {} });
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () => new Promise((resolve) => server.close(() => resolve()));
}, 60_000);

afterAll(async () => {
  await closeServer();
});

const whoami = (headers: Record<string, string>, query = "") => fetch(`${baseUrl}/probe/whoami${query}`, { headers });

describe("FirebaseMastraAuth on a Mastra node server with Auth Emulator tokens", () => {
  it("answers 200 with tenantId:uid as resource for a member holding core.chat.use", async () => {
    const response = await whoami({ authorization: `Bearer ${member.idToken}`, "x-tenant-id": TENANT });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ uid: member.uid, tenantId: TENANT, resourceId: `${TENANT}:${member.uid}` });
  });

  it("answers 401 without a token and for a garbage token", async () => {
    expect((await whoami({ "x-tenant-id": TENANT })).status).toBe(401);
    expect((await whoami({ authorization: "Bearer not-a-token", "x-tenant-id": TENANT })).status).toBe(401);
  });

  it("answers 401 when the token only travels as ?apiKey=", async () => {
    const response = await whoami({ "x-tenant-id": TENANT }, `?apiKey=${encodeURIComponent(member.idToken)}`);
    expect(response.status).toBe(401);
  });

  it("answers 403 for a member without core.chat.use and for a non-member", async () => {
    expect((await whoami({ authorization: `Bearer ${viewer.idToken}`, "x-tenant-id": TENANT })).status).toBe(403);
    expect((await whoami({ authorization: `Bearer ${outsider.idToken}`, "x-tenant-id": TENANT })).status).toBe(403);
  });

  it("answers 403 when no tenant is forwarded", async () => {
    expect((await whoami({ authorization: `Bearer ${member.idToken}` })).status).toBe(403);
  });

  it("answers 401 after the member's refresh tokens are revoked", async () => {
    const revoked = await signUp("revoked");
    // validSince has second granularity: revoke in a later second than the token was issued.
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await adminAuth.revokeRefreshTokens(revoked.uid);
    // Emulator mode always checks revocation (SP0 gotcha 3); the GET/POST split is unit-tested.
    expect((await whoami({ authorization: `Bearer ${revoked.idToken}`, "x-tenant-id": TENANT })).status).toBe(401);
  });
});
