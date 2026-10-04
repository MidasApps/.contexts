import { createHash } from "node:crypto";
import { ApiKeyIdSchema, type CreateApiKeyInput, OrganizationIdSchema, UserIdSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { authenticateRequest } from "../../../shared/http/authenticate-request.ts";
import { createInMemoryRateLimiter } from "../../../shared/rate-limit/in-memory-rate-limiter.ts";
import { createFakeTokenVerifier } from "../../adapters/driven/fake-token-verifier.ts";
import { API_KEY_NOW, buildApiKeyWorld } from "./api-key.fixture.ts";
import { makeVerifyBearer } from "./resolve-principal.ts";

const tenantId = OrganizationIdSchema.parse("org-a");
const orgNode = { level: "organization", tenantId } as const;
const input = (overrides: Partial<CreateApiKeyInput> = {}): CreateApiKeyInput => ({
  name: "Export",
  scopes: ["core.project.read"],
  node: orgNode,
  expiresAt: "2026-12-30T12:00:00.000Z",
  ...overrides,
});

describe("createApiKey", () => {
  it("returns the full key once and stores only the hash", async () => {
    const world = await buildApiKeyWorld();
    const created = await world.keys.createApiKey({
      actor: world.admin,
      access: world.access(),
      tenantId,
      input: input(),
      requestId: "r",
    });
    if (!created.ok) throw created.error;
    expect(created.data.secret).toMatch(new RegExp(`^core_${created.data.apiKey.publicId}_[A-Za-z0-9_-]{43}$`));
    expect(created.data.apiKey).toMatchObject({
      status: "active",
      ownerUid: world.admin.uid,
      lastUsedAt: null,
      scopes: ["core.project.read"],
    });
    const row = world.repository.rowOf(created.data.apiKey.id);
    expect(row?.secretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(row)).not.toContain(created.data.secret.split("_").slice(2).join("_"));
    expect(world.audited()).toContain("API_KEY_CREATED");
  });

  it("refuses scopes beyond the actor's permissions, and expiries out of range", async () => {
    const world = await buildApiKeyWorld();
    const escalation = await world.keys.createApiKey({
      actor: world.admin,
      access: world.access(),
      tenantId,
      input: input({ scopes: ["core.organization.delete"] }),
      requestId: "r",
    });
    expect(escalation).toMatchObject({ ok: false, error: { code: "ESCALATION_FORBIDDEN" } });
    const tooFar = await world.keys.createApiKey({
      actor: world.admin,
      access: world.access(),
      tenantId,
      input: input({ expiresAt: "2027-10-01T12:00:00.000Z" }),
      requestId: "r",
    });
    expect(tooFar).toMatchObject({ ok: false, error: { code: "API_KEY_EXPIRY_INVALID", issue: "EXPIRY_TOO_FAR" } });
    const past = await world.keys.createApiKey({
      actor: world.admin,
      access: world.access(),
      tenantId,
      input: input({ expiresAt: API_KEY_NOW }),
      requestId: "r",
    });
    expect(past).toMatchObject({ ok: false, error: { issue: "EXPIRY_NOT_IN_FUTURE" } });
    const stranger = await world.keys.createApiKey({
      actor: world.stranger,
      access: world.access(),
      tenantId,
      input: input(),
      requestId: "r",
    });
    expect(stranger).toMatchObject({ ok: false, error: { code: "ACCESS_DENIED" } });
  });
});

describe("authenticateApiKey", () => {
  it("authenticates a valid key as a service principal and throttles lastUsedAt to once a minute", async () => {
    const world = await buildApiKeyWorld();
    const { key, apiKeyId } = await world.createKey();
    expect(await world.authenticator.authenticate(key)).toEqual({
      type: "service",
      apiKeyId,
      tenantId,
      ownerUid: world.admin.uid,
    });
    expect(world.repository.rowOf(apiKeyId)?.apiKey.lastUsedAt).toBe(API_KEY_NOW);
    world.setNow("2026-09-30T12:00:30.000Z");
    await world.authenticator.authenticate(key);
    expect(world.repository.rowOf(apiKeyId)?.apiKey.lastUsedAt).toBe(API_KEY_NOW);
    world.setNow("2026-09-30T12:01:01.000Z");
    await world.authenticator.authenticate(key);
    expect(world.repository.rowOf(apiKeyId)?.apiKey.lastUsedAt).toBe("2026-09-30T12:01:01.000Z");
  });

  it("refuses a wrong secret, a wrong prefix, an unknown publicId, a revoked and an expired key", async () => {
    const world = await buildApiKeyWorld();
    const { key, apiKeyId } = await world.createKey();
    const [prefix, publicId] = key.split("_");
    expect(await world.authenticator.authenticate(`${prefix}_${publicId}_${"A".repeat(43)}`)).toBeNull();
    expect(await world.authenticator.authenticate(`acme_${key.slice(5)}`)).toBeNull();
    expect(await world.authenticator.authenticate(`core_ZZZZZZZZZZZZ_${"A".repeat(43)}`)).toBeNull();
    world.setNow("2026-12-30T12:00:00.000Z");
    expect(await world.authenticator.authenticate(key)).toBeNull();
    world.setNow(API_KEY_NOW);
    await world.keys.revokeApiKey({ actor: world.admin, access: world.access(), apiKeyId, requestId: "r" });
    expect(await world.authenticator.authenticate(key)).toBeNull();
  });

  it("is what verifyBearer calls for credentials with the prefix", async () => {
    const world = await buildApiKeyWorld();
    const { key } = await world.createKey();
    const verifyBearer = makeVerifyBearer({
      tokenVerifier: createFakeTokenVerifier({ tokens: {} }),
      apiKeyAuthenticator: world.authenticator,
      apiKeyPrefix: "core",
    });
    expect(await verifyBearer({ token: key, checkRevoked: true })).toMatchObject({ type: "service" });
  });
});

describe("revoking keys", () => {
  it("revokes by id (404 for unknown, 204 again when already revoked) and every key of a removed owner", async () => {
    const world = await buildApiKeyWorld();
    const first = await world.createKey();
    const second = await world.createKey();
    expect(
      await world.keys.revokeApiKey({
        actor: world.admin,
        access: world.access(),
        apiKeyId: ApiKeyIdSchema.parse("nope"),
        requestId: "r",
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(
      await world.keys.revokeApiKey({
        actor: world.admin,
        access: world.access(),
        apiKeyId: first.apiKeyId,
        requestId: "r",
      }),
    ).toEqual({ ok: true, data: undefined });
    expect(
      await world.keys.revokeApiKey({
        actor: world.admin,
        access: world.access(),
        apiKeyId: first.apiKeyId,
        requestId: "r",
      }),
    ).toEqual({ ok: true, data: undefined });
    const revoked = await world.keys.revoker.revokeOwnedKeys({
      tenantId,
      ownerUid: UserIdSchema.parse(world.admin.uid),
      actor: { type: "user", id: "owner" },
      requestId: "r",
    });
    expect(revoked).toBe(1);
    expect(world.repository.rowOf(second.apiKeyId)?.apiKey).toMatchObject({
      status: "revoked",
      revokedReason: "owner-removed",
    });
    expect(world.repository.rowOf(first.apiKeyId)?.apiKey.revokedReason).toBe("revoked");
  });

  it("lists keys of the organization without secrets or hashes", async () => {
    const world = await buildApiKeyWorld();
    await world.createKey();
    const listed = await world.keys.listApiKeys({
      actor: world.admin,
      access: world.access(),
      tenantId,
      page: { after: undefined, limit: 20 },
    });
    if (!listed.ok) throw listed.error;
    expect(listed.data.items).toHaveLength(1);
    expect(JSON.stringify(listed.data.items)).not.toMatch(/secret|Hash/);
  });
});

describe("failed API key lockout", () => {
  it("answers rate-limited before hashing once 20 failures from one IP were counted", async () => {
    let hashes = 0;
    const world = await buildApiKeyWorld({
      hashSecret: (secret) => {
        hashes += 1;
        return createHash("sha256").update(secret, "utf8").digest("hex");
      },
    });
    const clock = { now: () => new Date(API_KEY_NOW) };
    const rateLimiter = createInMemoryRateLimiter({ clock });
    const verifyBearer = makeVerifyBearer({
      tokenVerifier: createFakeTokenVerifier({ tokens: {} }),
      apiKeyAuthenticator: world.authenticator,
      apiKeyPrefix: "core",
    });
    const attempt = () =>
      authenticateRequest({
        request: new Request("http://localhost/v1/me/context", {
          headers: { authorization: `Bearer core_K7QX2M4PZ6AB_${"A".repeat(43)}` },
        }),
        clientIp: "203.0.113.9",
        verifyBearer,
        apiKeyPrefix: "core",
        rateLimiter,
      });
    for (let failure = 0; failure < 20; failure += 1) expect((await attempt()).kind).toBe("unauthenticated");
    expect(hashes).toBe(20);
    expect((await attempt()).kind).toBe("rate-limited");
    expect(hashes).toBe(20);
  });
});
