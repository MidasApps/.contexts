// Public API of the identity context: Bearer verification and principal resolution (SP1 Task 8),
// the `/v1/me*` vertical and the SP3 hook `resolveAccessContext` (SP1 Task 12).
export {
  isApiKeyCredential,
  makeResolvePrincipal,
  makeVerifyBearer,
  mapTokenToPrincipal,
  parseBearer,
  requiresRevocationCheck,
  type ResolvePrincipal,
  type ResolvePrincipalDeps,
  type VerifyBearer,
} from "./application/use-cases/resolve-principal.ts";
export type { TokenVerifier, VerifiedToken } from "./application/ports/driven/token-verifier.ts";
export { refuseAllApiKeys, type ApiKeyAuthenticator } from "./application/ports/driven/api-key-authenticator.ts";
export { createFirebaseTokenVerifier } from "./adapters/driven/firebase-token-verifier.ts";
export { createFakeTokenVerifier, type FakeTokenVerifier } from "./adapters/driven/fake-token-verifier.ts";
export { createIdentityServices, type IdentityServices } from "./composition.ts";
export { toMe, type MeDeps, type MeFlags } from "./application/me-deps.ts";
export {
  makeResolveAccessContext,
  type AccessContextResolution,
  type LoadAccessContext,
  type ResolveAccessContext,
  type ResolvedAccessContext,
} from "./application/use-cases/resolve-access-context.ts";
export { applyPreferencesPatch } from "./application/use-cases/update-me.ts";
export type { UserProfilePatch, UserRepository } from "./application/ports/driven/user-repository.ts";
export type { AuthAccount, AuthAccountReader } from "./application/ports/driven/auth-account-reader.ts";
export { noopApiKeyRevoker, type ApiKeyRevoker } from "./application/ports/driven/api-key-revoker.ts";
export { AccountMissingError } from "./domain/errors/account-missing-error.ts";
export { createFirestoreUserRepository } from "./adapters/driven/firestore-user-repository.ts";
export { createFirebaseAuthAccountReader } from "./adapters/driven/firebase-auth-account-reader.ts";
export { createInMemoryUserRepository, type InMemoryUserRepository } from "./adapters/driven/in-memory-user-repository.ts";
// Web and desktop sessions (SP1 Task 13, decision 0007).
export { createSessionServices, type SessionServices } from "./session-composition.ts";
export type { SessionDeps } from "./application/session-deps.ts";
export {
  makeSessionActions,
  SESSION_COOKIE_NAME,
  type CookieJar,
  type SessionActionContext,
  type SessionActionError,
  type SessionActionResult,
  type SessionActions,
} from "./adapters/driving/session-actions.ts";
export { makeSessionGuards, type SessionGuards, type StaffSessionGuardResult, type WebSessionGuardResult } from "./adapters/driving/session-guards.ts";
export { createFirebaseSessionVertical, type FirebaseSessionVertical } from "./firebase-session-composition.ts";
export { createInMemorySessionRepository, type InMemorySessionRepository } from "./adapters/driven/in-memory-session-repository.ts";
export { createFakeFirebaseAuth, type FakeFirebaseAuth } from "./adapters/driven/fake-firebase-auth.ts";
export type { SessionRecord } from "./domain/session-record.schema.ts";
// Scoped API keys (SP1 Task 14, decision 0008).
export { createApiKeyServices, createFirestoreApiKeyServices, type ApiKeyServices } from "./api-key-composition.ts";
export type { ApiKeyDeps } from "./application/api-key-deps.ts";
export type { ApiKeyRepository, StoredApiKey } from "./application/ports/driven/api-key-repository.ts";
export { formatApiKey, generateApiKeyParts, parseApiKey, type ApiKeyParts } from "./domain/api-key-format.ts";
export { createInMemoryApiKeyRepository, type InMemoryApiKeyRepository } from "./adapters/driven/in-memory-api-key-repository.ts";
// Device activations and devices (SP1 Task 15, decision 0008).
export { createDeviceServices, createFirestoreDeviceServices, type DeviceServices } from "./device-composition.ts";
export type { DeviceDeps } from "./application/device-deps.ts";
export { generateActivationCode, hashActivationCode, normalizeActivationCode } from "./domain/activation-code.ts";
export { createInMemoryDeviceActivationRepository, createInMemoryDeviceRepository } from "./adapters/driven/in-memory-device-repositories.ts";
