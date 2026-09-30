// Composition root of the API key vertical (SP1 Task 14, decision 0008).
import type { Firestore } from "firebase-admin/firestore";
import { sha256Hex } from "../shared/crypto/sha256.ts";
import { createFirestoreUnitOfWork } from "../shared/firestore/unit-of-work.ts";
import { createFirestoreApiKeyRepository } from "./adapters/driven/firestore-api-key-repository.ts";
import type { ApiKeyDeps } from "./application/api-key-deps.ts";
import type { ApiKeyAuthenticator } from "./application/ports/driven/api-key-authenticator.ts";
import type { ApiKeyRevoker } from "./application/ports/driven/api-key-revoker.ts";
import { makeAuthenticateApiKey } from "./application/use-cases/authenticate-api-key.ts";
import { makeCreateApiKey, type CreateApiKey } from "./application/use-cases/create-api-key.ts";
import { makeListApiKeys, type ListApiKeys } from "./application/use-cases/list-api-keys.ts";
import { makeRevokeApiKey, type RevokeApiKey } from "./application/use-cases/revoke-api-key.ts";
import { makeRevokeApiKeysOfOwner } from "./application/use-cases/revoke-api-keys-of-owner.ts";

export type ApiKeyServices = {
  readonly createApiKey: CreateApiKey;
  readonly listApiKeys: ListApiKeys;
  readonly revokeApiKey: RevokeApiKey;
  /** Wired into `verifyBearer` (the `service` principal path). */
  readonly authenticator: ApiKeyAuthenticator;
  /** Wired into the access context (member removal revokes the member's keys). */
  readonly revoker: ApiKeyRevoker;
};

/** Binds the API key use cases; `hashSecret` defaults to sha256 hex. */
export const createApiKeyServices = (deps: Omit<ApiKeyDeps, "hashSecret"> & { hashSecret?: ApiKeyDeps["hashSecret"] }): ApiKeyServices => {
  const full: ApiKeyDeps = { ...deps, hashSecret: deps.hashSecret ?? sha256Hex };
  return {
    createApiKey: makeCreateApiKey(full),
    listApiKeys: makeListApiKeys(full),
    revokeApiKey: makeRevokeApiKey(full),
    authenticator: makeAuthenticateApiKey(full),
    revoker: makeRevokeApiKeysOfOwner(full),
  };
};

/** The API key vertical over Firestore (`createCoreServer`). */
export const createFirestoreApiKeyServices = (deps: Omit<ApiKeyDeps, "hashSecret" | "apiKeys" | "unitOfWork"> & { firestore: Firestore }): ApiKeyServices => {
  const { firestore, ...rest } = deps;
  return createApiKeyServices({ ...rest, apiKeys: createFirestoreApiKeyRepository({ firestore }), unitOfWork: createFirestoreUnitOfWork({ firestore }) });
};
