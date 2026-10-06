import type { AuditLogEntry, TenantId, UserId } from "@core/contracts";

/**
 * Revokes every active API key a user owns in a tenant (SP1 spec §5.3: removing a member
 * revokes their keys). Implemented by the API keys vertical (SP1 Task 14); until then the
 * composition wires `noopApiKeyRevoker`. Keys of a removed owner are already useless:
 * `authorize()` evaluates the owner's current grants in the key's place.
 */
export type ApiKeyRevoker = {
  /** @returns how many keys were revoked. */
  readonly revokeOwnedKeys: (args: {
    tenantId: TenantId;
    ownerUid: UserId;
    actor: AuditLogEntry["actor"];
    requestId: string;
  }) => Promise<number>;
};

/** Stand-in until SP1 Task 14 lands the API keys store: there are no keys to revoke. */
export const noopApiKeyRevoker: ApiKeyRevoker = { revokeOwnedKeys: () => Promise.resolve(0) };
