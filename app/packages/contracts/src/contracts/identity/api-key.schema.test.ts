import { describe, expect, it } from "vitest";
import { EXAMPLE_IDS } from "../example-values.ts";
import {
  API_KEY_MAX_LIFETIME_DAYS,
  ApiKeyContract,
  ApiKeySchema,
  apiKeyExpiryIssue,
  CreateApiKeyInputContract,
  CreateApiKeyInputSchema,
  CreateApiKeyResponseContract,
} from "./api-key.schema.ts";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const DAY_MS = 86_400_000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

const input = {
  name: "Reporting export",
  scopes: ["core.project.read"],
  node: { level: "organization", tenantId: EXAMPLE_IDS.organization },
  expiresAt: at(30 * DAY_MS),
};

describe("apiKeyExpiryIssue", () => {
  it("accepts any instant after now up to 365 days", () => {
    expect(apiKeyExpiryIssue({ expiresAt: at(1), now: NOW })).toBeNull();
    expect(apiKeyExpiryIssue({ expiresAt: at(API_KEY_MAX_LIFETIME_DAYS * DAY_MS), now: NOW })).toBeNull();
  });

  it("rejects an expiry that is not in the future", () => {
    expect(apiKeyExpiryIssue({ expiresAt: at(0), now: NOW })).toBe("EXPIRY_NOT_IN_FUTURE");
    expect(apiKeyExpiryIssue({ expiresAt: at(-DAY_MS), now: NOW })).toBe("EXPIRY_NOT_IN_FUTURE");
  });

  it("rejects an expiry beyond 365 days", () => {
    expect(apiKeyExpiryIssue({ expiresAt: at(API_KEY_MAX_LIFETIME_DAYS * DAY_MS + 1), now: NOW })).toBe("EXPIRY_TOO_FAR");
  });
});

describe("CreateApiKeyInputSchema", () => {
  it("requires expiresAt", () => {
    expect(CreateApiKeyInputSchema.safeParse({ ...input, expiresAt: undefined }).success).toBe(false);
    expect(CreateApiKeyInputSchema.safeParse(input).success).toBe(true);
  });

  it("requires 1-200 distinct, well-formed scopes", () => {
    expect(CreateApiKeyInputSchema.safeParse({ ...input, scopes: [] }).success).toBe(false);
    expect(CreateApiKeyInputSchema.safeParse({ ...input, scopes: ["core.project.read", "core.project.read"] }).success).toBe(false);
    expect(CreateApiKeyInputSchema.safeParse({ ...input, scopes: ["project.read"] }).success).toBe(false);
  });

  it("rejects a platform node", () => {
    expect(CreateApiKeyInputSchema.safeParse({ ...input, node: { level: "platform" } }).success).toBe(false);
  });
});

describe("ApiKey contracts", () => {
  it("never expose the secret or its hash on the stored key", () => {
    expect(Object.keys(ApiKeySchema.shape).filter((key) => /secret|hash/i.test(key))).toEqual([]);
  });

  it("mark the one-time secret of the create response as sensitive", () => {
    expect(CreateApiKeyResponseContract.meta.pii).toBe("sensitive");
  });

  it("parse their catalog examples", () => {
    for (const contract of [ApiKeyContract, CreateApiKeyInputContract, CreateApiKeyResponseContract]) {
      for (const example of contract.meta.examples) expect(contract.schema.safeParse(example).success).toBe(true);
    }
  });
});
