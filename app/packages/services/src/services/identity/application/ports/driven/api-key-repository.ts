import type { ApiKey, ApiKeyId, ApiKeyRevokedReason, TenantId, UserId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { Page, PageRequest } from "../../../../shared/pagination/page.ts";

/** A key with the hash of its secret, for authentication only. */
export type StoredApiKey = { readonly apiKey: ApiKey; readonly secretHash: string };

/**
 * `api-keys` (SP1 spec §4, decision 0008). Only `findByPublicId` returns the secret hash;
 * every other read returns the `ApiKey` contract, which has none.
 */
export type ApiKeyRepository = {
  readonly newId: () => ApiKeyId;
  readonly create: (tx: Transaction, args: { apiKey: ApiKey; secretHash: string; actorId: string }) => void;
  readonly get: (tx: Transaction | undefined, id: ApiKeyId) => Promise<ApiKey | null>;
  readonly findByPublicId: (publicId: string) => Promise<StoredApiKey | null>;
  /** Newest first (`createdAt desc`, id desc). */
  readonly list: (args: { tenantId: TenantId; page: PageRequest }) => Promise<Page<ApiKey>>;
  readonly listActiveOfOwner: (args: { tenantId: TenantId; ownerUid: UserId }) => Promise<readonly ApiKey[]>;
  readonly revoke: (
    tx: Transaction,
    args: { id: ApiKeyId; reason: ApiKeyRevokedReason; updatedAt: string; actorId: string },
  ) => void;
  readonly touchLastUsed: (args: { id: ApiKeyId; lastUsedAt: string }) => Promise<void>;
};
