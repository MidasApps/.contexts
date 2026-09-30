// Public API of the identity context (SP1 Task 8): Bearer verification and principal resolution.
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
