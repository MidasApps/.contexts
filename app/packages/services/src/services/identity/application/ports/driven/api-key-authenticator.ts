import type { ServicePrincipal } from "@core/contracts";

/**
 * Driven port that turns a full API key (`<prefix>_<publicId>_<secret>`, decision 0008)
 * into a `service` principal. Implemented in SP1 Task 14; the pipeline counts failures
 * per IP (`api-key-failure`) around it.
 */
export type ApiKeyAuthenticator = {
  /** @returns `null` for an unknown, revoked, expired or mismatched key. */
  readonly authenticate: (credential: string) => Promise<ServicePrincipal | null>;
};

/** Until Task 14 wires the Firestore authenticator, every API key is refused (fail-closed). */
export const refuseAllApiKeys: ApiKeyAuthenticator = { authenticate: () => Promise.resolve(null) };
