import type { Firestore } from "firebase-admin/firestore";
import type { SecretStore } from "../../application/ports/connector-ports.ts";
import { LocalSecretStoreOutsideLocalError } from "../../domain/connector-errors.ts";

/** Firestore-emulator collection of the local secret store; Security Rules deny every client. */
export const LOCAL_SECRETS_COLLECTION = "local-secrets";

/**
 * `SecretStore` for `APP_ENV=local` only (decision 0027): a collection in the Firestore
 * emulator, so local connectors work without Secret Manager.
 * @throws {LocalSecretStoreOutsideLocalError} outside `local` (startup bug, never a fallback).
 */
export const createLocalSecretStore = (deps: {
  readonly firestore: Firestore;
  readonly appEnv: string;
}): SecretStore => {
  if (deps.appEnv !== "local") throw new LocalSecretStoreOutsideLocalError(deps.appEnv);
  const doc = (name: string) => deps.firestore.collection(LOCAL_SECRETS_COLLECTION).doc(name);
  return {
    put: async (name, value) => void (await doc(name).set({ value, updatedAt: new Date().toISOString() })),
    get: async (name) => {
      const value: unknown = (await doc(name).get()).get("value");
      return typeof value === "string" ? value : null;
    },
    delete: async (name) => void (await doc(name).delete()),
  };
};
