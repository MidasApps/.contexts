// Public API of the identity context: Bearer verification and principal resolution (SP1 Task 8),
// the `/v1/me*` vertical and the SP3 hook `resolveAccessContext` (SP1 Task 12).

export { createFakeFirebaseAuth, type FakeFirebaseAuth } from "./adapters/driven/fake-firebase-auth.ts";
export { createFakeTokenVerifier, type FakeTokenVerifier } from "./adapters/driven/fake-token-verifier.ts";
export { createFirebaseAuthAccountReader } from "./adapters/driven/firebase-auth-account-reader.ts";
export { createFirebaseTokenVerifier } from "./adapters/driven/firebase-token-verifier.ts";
export { createFirestoreUserRepository } from "./adapters/driven/firestore-user-repository.ts";
export {
  createInMemoryApiKeyRepository,
  type InMemoryApiKeyRepository,
} from "./adapters/driven/in-memory-api-key-repository.ts";
export {
  createInMemoryDeviceActivationRepository,
  createInMemoryDeviceRepository,
} from "./adapters/driven/in-memory-device-repositories.ts";
export {
  createInMemoryImpersonationSessionRepository,
  createInMemoryPlatformStaffRepository,
  type InMemoryImpersonationSessionRepository,
  type InMemoryPlatformStaffRepository,
} from "./adapters/driven/in-memory-platform-repositories.ts";
export {
  createInMemorySessionRepository,
  type InMemorySessionRepository,
} from "./adapters/driven/in-memory-session-repository.ts";
export {
  createInMemoryUserRepository,
  type InMemoryUserRepository,
} from "./adapters/driven/in-memory-user-repository.ts";
export {
  type AdminImpersonationRouteDeps,
  buildAdminImpersonationRoutes,
  IMPERSONATION_ADMIN_PERMISSIONS,
} from "./adapters/driving/admin-impersonation-routes.ts";
export {
  type CookieJar,
  makeSessionActions,
  SESSION_COOKIE_NAME,
  type SessionActionContext,
  type SessionActionError,
  type SessionActionResult,
  type SessionActions,
} from "./adapters/driving/session-actions.ts";
export {
  makeSessionGuards,
  type SessionGuards,
  type StaffSessionGuardResult,
  type WebSessionGuardResult,
} from "./adapters/driving/session-guards.ts";
// Scoped API keys (SP1 Task 14, decision 0008).
export { type ApiKeyServices, createApiKeyServices, createFirestoreApiKeyServices } from "./api-key-composition.ts";
export type { ApiKeyDeps } from "./application/api-key-deps.ts";
export type { DeviceDeps } from "./application/device-deps.ts";
export { type MeDeps, type MeFlags, toMe } from "./application/me-deps.ts";
export type { PlatformDeps } from "./application/platform-deps.ts";
export { type ApiKeyAuthenticator, refuseAllApiKeys } from "./application/ports/driven/api-key-authenticator.ts";
export type { ApiKeyRepository, StoredApiKey } from "./application/ports/driven/api-key-repository.ts";
export { type ApiKeyRevoker, noopApiKeyRevoker } from "./application/ports/driven/api-key-revoker.ts";
export type { AuthAccount, AuthAccountReader } from "./application/ports/driven/auth-account-reader.ts";
export type { ImpersonationSessionRepository } from "./application/ports/driven/impersonation-session-repository.ts";
export type { PlatformStaffRepository } from "./application/ports/driven/platform-staff-repository.ts";
export type { TokenVerifier, VerifiedToken } from "./application/ports/driven/token-verifier.ts";
export type { UserProfilePatch, UserRepository } from "./application/ports/driven/user-repository.ts";
export type { SessionDeps } from "./application/session-deps.ts";
export type {
  AuditImpersonatedRequest,
  ImpersonatedRequest,
} from "./application/use-cases/audit-impersonated-request.ts";
export type { EndImpersonation } from "./application/use-cases/end-impersonation.ts";
export type { GrantPlatformStaff } from "./application/use-cases/grant-platform-staff.ts";
export {
  type AccessContextResolution,
  type LoadAccessContext,
  makeResolveAccessContext,
  type ResolveAccessContext,
  type ResolvedAccessContext,
} from "./application/use-cases/resolve-access-context.ts";
export {
  isApiKeyCredential,
  makeResolvePrincipal,
  makeVerifyBearer,
  mapTokenToPrincipal,
  parseBearer,
  type ResolvePrincipal,
  type ResolvePrincipalDeps,
  requiresRevocationCheck,
  type VerifyBearer,
} from "./application/use-cases/resolve-principal.ts";
export type { StartImpersonation, StartImpersonationCommand } from "./application/use-cases/start-impersonation.ts";
export { applyPreferencesPatch } from "./application/use-cases/update-me.ts";
export { createIdentityServices, type IdentityServices } from "./composition.ts";
// Device activations and devices (SP1 Task 15, decision 0008).
export { createDeviceServices, createFirestoreDeviceServices, type DeviceServices } from "./device-composition.ts";
export { generateActivationCode, hashActivationCode, normalizeActivationCode } from "./domain/activation-code.ts";
export { type ApiKeyParts, formatApiKey, generateApiKeyParts, parseApiKey } from "./domain/api-key-format.ts";
export { AccountMissingError } from "./domain/errors/account-missing-error.ts";
export { ImpersonationNotFoundError } from "./domain/errors/impersonation-errors.ts";
export type { SessionRecord } from "./domain/session-record.schema.ts";
export { createFirebaseSessionVertical, type FirebaseSessionVertical } from "./firebase-session-composition.ts";
// Platform staff and read-only impersonation (SP1 Task 16).
export {
  createFirestorePlatformServices,
  createPlatformServices,
  type PlatformServices,
} from "./platform-composition.ts";
// Web and desktop sessions (SP1 Task 13, decision 0007).
export { createSessionServices, type SessionServices } from "./session-composition.ts";
