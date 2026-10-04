import type { ApiKey, ServicePrincipal } from "@core/contracts";
import { isAtOrBefore } from "../../../shared/clock/clock.ts";
import { parseApiKey } from "../../domain/api-key-format.ts";
import { secretHashesMatch } from "../../domain/session-secret.ts";
import type { ApiKeyDeps } from "../api-key-deps.ts";
import type { ApiKeyAuthenticator } from "../ports/driven/api-key-authenticator.ts";

/** `lastUsedAt` is written at most once a minute (decision 0008 §4). */
export const LAST_USED_THROTTLE_MS = 60_000;

// A hash that never matches, compared when the publicId is unknown so both paths do the same work.
const NO_MATCH_HASH = "0".repeat(64);

const isUsable = (apiKey: ApiKey, now: Date): boolean =>
  apiKey.status === "active" && !isAtOrBefore(apiKey.expiresAt, now);

const touchIfStale = async (deps: ApiKeyDeps, apiKey: ApiKey, now: Date): Promise<void> => {
  if (apiKey.lastUsedAt !== null && now.getTime() - Date.parse(apiKey.lastUsedAt) < LAST_USED_THROTTLE_MS) return;
  try {
    await deps.apiKeys.touchLastUsed({ id: apiKey.id, lastUsedAt: now.toISOString() });
  } catch (e: unknown) {
    // Bookkeeping only: a failed write never fails the request.
    deps.logger.warn("api_key_last_used_write_failed", { apiKeyId: apiKey.id, err: e });
  }
};

/**
 * The `/v1` pipeline's `ApiKeyAuthenticator` (SP1 spec §3.2, §6.3). The per-IP failure limit
 * (`api-key-failure`) runs in the pipeline before this is called, so a locked-out IP never
 * reaches the hash. The secret's sha256 is compared with `timingSafeEqual`; revoked, expired
 * and unknown keys are refused alike. Scopes and the owner's grants are `authorize()`'s job.
 */
export const makeAuthenticateApiKey = (deps: ApiKeyDeps): ApiKeyAuthenticator => ({
  authenticate: async (credential) => {
    const parts = parseApiKey(credential, deps.apiKeyPrefix);
    if (parts === null) return null;
    const presented = deps.hashSecret(parts.secret);
    const stored = await deps.apiKeys.findByPublicId(parts.publicId);
    const matches = secretHashesMatch(stored?.secretHash ?? NO_MATCH_HASH, presented);
    const now = deps.clock.now();
    if (stored === null || !matches || !isUsable(stored.apiKey, now)) return null;
    await touchIfStale(deps, stored.apiKey, now);
    const principal: ServicePrincipal = {
      type: "service",
      apiKeyId: stored.apiKey.id,
      tenantId: stored.apiKey.tenantId,
      ownerUid: stored.apiKey.ownerUid,
    };
    return principal;
  },
});
