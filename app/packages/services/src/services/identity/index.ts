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
