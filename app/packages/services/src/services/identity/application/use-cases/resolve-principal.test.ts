import type { ServicePrincipal } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { createFakeTokenVerifier } from "../../adapters/driven/fake-token-verifier.ts";
import type { ApiKeyAuthenticator } from "../ports/driven/api-key-authenticator.ts";
import type { VerifiedToken } from "../ports/driven/token-verifier.ts";
import {
  isApiKeyCredential,
  makeResolvePrincipal,
  makeVerifyBearer,
  parseBearer,
  requiresRevocationCheck,
} from "./resolve-principal.ts";

const token = (overrides: Partial<VerifiedToken> = {}): VerifiedToken => ({
  uid: "user-1",
  claims: {},
  signInProvider: "password",
  secondFactor: null,
  ...overrides,
});

const serviceKey = {
  type: "service",
  apiKeyId: "key-1",
  tenantId: "org-a",
  ownerUid: "owner-a",
} as unknown as ServicePrincipal;

const setup = (tokens: Record<string, VerifiedToken>) => {
  const verifier = createFakeTokenVerifier({ tokens });
  const keyCalls: string[] = [];
  const apiKeys: ApiKeyAuthenticator = {
    authenticate: (credential) => {
      keyCalls.push(credential);
      return Promise.resolve(credential === "core_PUBLIC123456_secret" ? serviceKey : null);
    },
  };
  const deps = { tokenVerifier: verifier, apiKeyAuthenticator: apiKeys, apiKeyPrefix: "core" };
  return { verifier, keyCalls, verifyBearer: makeVerifyBearer(deps), resolvePrincipal: makeResolvePrincipal(deps) };
};

describe("parseBearer", () => {
  it("reads only the Bearer scheme with one non-empty token", () => {
    expect(parseBearer("Bearer abc.def")).toBe("abc.def");
    expect(parseBearer("bearer abc")).toBe("abc");
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("Basic abc")).toBeNull();
    expect(parseBearer("Bearer ")).toBeNull();
    expect(parseBearer("Bearer a b")).toBeNull();
    expect(parseBearer("abc")).toBeNull();
  });
});

describe("requiresRevocationCheck (follow-up #12e)", () => {
  it("skips the revocation check only for GET and HEAD", () => {
    expect(requiresRevocationCheck("GET")).toBe(false);
    expect(requiresRevocationCheck("HEAD")).toBe(false);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) expect(requiresRevocationCheck(method)).toBe(true);
  });
});

describe("resolvePrincipal", () => {
  it("passes checkRevoked false for GET and true for every mutation", async () => {
    const { verifier, resolvePrincipal } = setup({ t1: token() });
    for (const method of ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"])
      await resolvePrincipal({ authorization: "Bearer t1", method });
    expect(verifier.calls().map((call) => call.checkRevoked)).toEqual([false, false, true, true, true, true]);
  });

  it("maps a plain token to a user without MFA", async () => {
    const { resolvePrincipal } = setup({ t1: token() });
    expect(await resolvePrincipal({ authorization: "Bearer t1", method: "GET" })).toEqual({
      type: "user",
      uid: "user-1",
      mfa: false,
    });
  });

  it("returns null for a missing header, an unknown token or a revoked token on a mutation", async () => {
    const verifier = createFakeTokenVerifier({ tokens: { t1: token() }, revoked: ["t1"] });
    const resolvePrincipal = makeResolvePrincipal({
      tokenVerifier: verifier,
      apiKeyAuthenticator: { authenticate: () => Promise.resolve(null) },
      apiKeyPrefix: "core",
    });
    expect(await resolvePrincipal({ authorization: null, method: "GET" })).toBeNull();
    expect(await resolvePrincipal({ authorization: "Bearer nope", method: "GET" })).toBeNull();
    expect(await resolvePrincipal({ authorization: "Bearer t1", method: "GET" })).not.toBeNull();
    expect(await resolvePrincipal({ authorization: "Bearer t1", method: "POST" })).toBeNull();
  });
});

describe("verifyBearer: claims", () => {
  it("carries the session id of a custom-token sign-in minted by a session exchange", async () => {
    const { verifyBearer } = setup({
      c: token({ signInProvider: "custom", claims: { sessionId: "sess-1", smfa: true } }),
      p: token({ signInProvider: "password", claims: { sessionId: "sess-1" } }),
    });
    expect(await verifyBearer({ token: "c", checkRevoked: false })).toEqual({
      type: "user",
      uid: "user-1",
      mfa: true,
      sessionId: "sess-1",
    });
    expect(await verifyBearer({ token: "p", checkRevoked: false })).toEqual({
      type: "user",
      uid: "user-1",
      mfa: false,
    });
  });

  it("maps the device claim to a device principal of its tenant", async () => {
    const { verifyBearer } = setup({
      d: token({ uid: "dev-1", signInProvider: "custom", claims: { principalType: "device", tenantId: "org-a" } }),
    });
    expect(await verifyBearer({ token: "d", checkRevoked: false })).toEqual({
      type: "device",
      deviceId: "dev-1",
      tenantId: "org-a",
    });
  });

  it("rejects a device claim without a tenant and an unknown principal type", async () => {
    const { verifyBearer } = setup({
      noTenant: token({ claims: { principalType: "device" } }),
      service: token({ claims: { principalType: "service", tenantId: "org-a" } }),
    });
    expect(await verifyBearer({ token: "noTenant", checkRevoked: false })).toBeNull();
    expect(await verifyBearer({ token: "service", checkRevoked: false })).toBeNull();
  });

  it("maps the impersonation claims, without MFA, and rejects half of them", async () => {
    const { verifyBearer } = setup({
      imp: token({ signInProvider: "custom", claims: { imp: "imp-1", impBy: "staff-1", smfa: true } }),
      half: token({ signInProvider: "custom", claims: { imp: "imp-1" } }),
    });
    expect(await verifyBearer({ token: "imp", checkRevoked: false })).toEqual({
      type: "user",
      uid: "user-1",
      mfa: false,
      impersonation: { sessionId: "imp-1", staffUid: "staff-1" },
    });
    expect(await verifyBearer({ token: "half", checkRevoked: false })).toBeNull();
  });

  it("honours a second factor, and smfa only with the custom provider", async () => {
    const { verifyBearer } = setup({
      totp: token({ secondFactor: "totp" }),
      phone: token({ secondFactor: "phone" }),
      custom: token({ signInProvider: "custom", claims: { smfa: true } }),
      forged: token({ signInProvider: "password", claims: { smfa: true } }),
      odd: token({ secondFactor: "email" }),
    });
    const mfaOf = async (name: string) =>
      ((await verifyBearer({ token: name, checkRevoked: false })) as { mfa: boolean }).mfa;
    expect([
      await mfaOf("totp"),
      await mfaOf("phone"),
      await mfaOf("custom"),
      await mfaOf("forged"),
      await mfaOf("odd"),
    ]).toEqual([true, true, true, false, false]);
  });
});

describe("verifyBearer: API keys", () => {
  it("routes a prefixed credential to the API key authenticator, never to Firebase", async () => {
    const { verifier, keyCalls, verifyBearer } = setup({});
    expect(await verifyBearer({ token: "core_PUBLIC123456_secret", checkRevoked: true })).toBe(serviceKey);
    expect(await verifyBearer({ token: "core_PUBLIC123456_wrong", checkRevoked: true })).toBeNull();
    expect(keyCalls).toHaveLength(2);
    expect(verifier.calls()).toEqual([]);
  });

  it("recognises the configured prefix only", () => {
    expect(isApiKeyCredential("core_abc_def", "core")).toBe(true);
    expect(isApiKeyCredential("corex_abc_def", "core")).toBe(false);
    expect(isApiKeyCredential("eyJhbGciOi.x.y", "core")).toBe(false);
  });
});
