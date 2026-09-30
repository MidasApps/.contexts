import type { ApiKeyRevoker } from "../ports/driven/api-key-revoker.ts";
import type { ApiKeyDeps } from "../api-key-deps.ts";
import { revokeKey } from "./revoke-api-key.ts";

/**
 * The access context's `ApiKeyRevoker` (SP1 spec §5.3): removing a member revokes every
 * active key they own in the tenant, with reason `owner-removed`.
 */
export const makeRevokeApiKeysOfOwner = (deps: ApiKeyDeps): ApiKeyRevoker => ({
  revokeOwnedKeys: async ({ tenantId, ownerUid, actor, requestId }) => {
    const keys = await deps.apiKeys.listActiveOfOwner({ tenantId, ownerUid });
    for (const apiKey of keys) await revokeKey(deps, { apiKey, reason: "owner-removed", actor, requestId });
    return keys.length;
  },
});
