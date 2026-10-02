// Composition root of the core server: builds every adapter once per process and binds the
// `/v1` pipeline, the access core, the access write side and the audit writer. Apps call it lazily.
import { randomBytes } from "node:crypto";
import type { ModuleSettingsManifest, PermissionDefinition, UnitTypeDefinition } from "@core/contracts";
import { createFirestoreAccessAdapters, type FirestoreAccessAdapters } from "./access/adapters/driven/firestore-access-adapters.ts";
import { createNoopInvitationNotifier } from "./access/adapters/driven/noop-invitation-notifier.ts";
import type { AccessWriteDeps } from "./access/application/access-write-deps.ts";
import type { AccessReaders } from "./access/application/ports/driven/access-readers.ts";
import type { InvitationNotifier } from "./access/application/ports/driven/invitation-notifier.ts";
import { makeSyncClaims } from "./access/application/use-cases/sync-claims.ts";
import { createAccessCore, createAccessServices, type AccessCore, type AccessServices } from "./access/composition.ts";
import type { RandomBytes } from "./access/domain/invitation-token.ts";
import { createMemberServices, type MemberServices } from "./access/member-composition.ts";
import { createFirestoreApprovalServices, type ApprovalServices } from "./access/approval-composition.ts";
import type { ApprovalActionHandler } from "./access/application/ports/driven/approval-action-handler.ts";
import { createFirestoreAuditLogWriter } from "./audit/adapters/driven/firestore-audit-log-writer.ts";
import { createFirestoreAuditLogServices, type AuditLogServices } from "./audit/composition.ts";
import { makeRecordAudit, type AuditWriter } from "./audit/application/use-cases/record-audit.ts";
import { buildCoreRoutes, type CoreRoutes } from "./core-routes.ts";
import { createFirebaseTokenVerifier } from "./identity/adapters/driven/firebase-token-verifier.ts";
import type { ApiKeyAuthenticator } from "./identity/application/ports/driven/api-key-authenticator.ts";
import type { ApiKeyRevoker } from "./identity/application/ports/driven/api-key-revoker.ts";
import { createFirestoreApiKeyServices, type ApiKeyServices } from "./identity/api-key-composition.ts";
import { createFirestoreDeviceServices, type DeviceServices } from "./identity/device-composition.ts";
import { createFirebaseCustomTokenIssuer } from "./identity/adapters/driven/firebase-custom-token-issuer.ts";
import { createFirestorePlatformServices, type PlatformServices } from "./identity/platform-composition.ts";
import type { TokenVerifier } from "./identity/application/ports/driven/token-verifier.ts";
import { createFirebaseAuthAccountReader } from "./identity/adapters/driven/firebase-auth-account-reader.ts";
import { createFirebaseUserAccountReader } from "./identity/adapters/driven/firebase-user-account-reader.ts";
import { createFirestoreUserRepository } from "./identity/adapters/driven/firestore-user-repository.ts";
import type { ResolveAccessContext } from "./identity/application/use-cases/resolve-access-context.ts";
import { createIdentityServices, type IdentityServices } from "./identity/composition.ts";
import { createFirebaseSessionVertical } from "./identity/firebase-session-composition.ts";
import type { SessionActions } from "./identity/adapters/driving/session-actions.ts";
import type { SessionGuards } from "./identity/adapters/driving/session-guards.ts";
import type { SessionServices } from "./identity/session-composition.ts";
import { makeVerifyBearer, type VerifyBearer } from "./identity/application/use-cases/resolve-principal.ts";
import { systemClock, type Clock } from "./shared/clock/clock.ts";
import type { FirebaseAdmin } from "./shared/firebase/firebase-admin.ts";
import { createFirestoreUnitOfWork } from "./shared/firestore/unit-of-work.ts";
import type { ApiRouteDeps } from "./shared/http/api-route.ts";
import { createFirestoreIdempotencyStore } from "./shared/idempotency/firestore-idempotency-store.ts";
import type { Logger } from "./shared/observability/logger.ts";
import { createFirestoreRateLimiter } from "./shared/rate-limit/firestore-rate-limiter.ts";
import { createFirestoreTenancyAdapters, type FirestoreTenancyAdapters } from "./tenancy/adapters/driven/firestore-tenancy-adapters.ts";
import { createTenancyServices, type TenancyServices } from "./tenancy/composition.ts";
import { buildModuleSettingsRoutes } from "./modules/adapters/driving/module-settings-routes.ts";
import { createFirestoreModuleSettingsServices, type ModuleSettingsServices } from "./modules/composition.ts";
import { moduleSettingsDefinitionsOf } from "./modules/domain/module-settings-registry.ts";

export { createRouteResolver, UnknownEndpointError, type CoreRoutes } from "./core-routes.ts";

/** What a module contributes to the server; a `defineModule` manifest (decision 0015) satisfies it. */
export type CoreServerModule = {
  readonly id: string;
  readonly permissions?: readonly PermissionDefinition[];
  /** Unit types for tenancy (`createTenancyServices({ unitTypes })`, SP1 Task 10 wires them). */
  readonly unitTypes?: readonly UnitTypeDefinition[] | undefined;
  /** Settings served by `GET|PUT /v1/organizations/{organizationId}/module-settings/{moduleId}`. */
  readonly settings?: ModuleSettingsManifest | undefined;
};

/** Adapters a caller may replace (tests, and later tasks until their Firestore adapters land). */
export type CoreServerAdapters = {
  /** Replaces only the four `authorize()` readers. */
  readonly accessReaders?: AccessReaders;
  /** Every access adapter at once (defaults to Firestore and Firebase Auth). */
  readonly access?: FirestoreAccessAdapters;
  readonly apiKeyAuthenticator?: ApiKeyAuthenticator;
  /** Emulator route tests pass `createFakeTokenVerifier` (the Auth Emulator always checks revocation). */
  readonly tokenVerifier?: TokenVerifier;
  readonly tenancy?: FirestoreTenancyAdapters;
  /** Replaces the Firestore revoker of the API keys vertical (member removal revokes keys). */
  readonly apiKeyRevoker?: ApiKeyRevoker;
  /** The core logs only; an application may deliver invitation links (SP1 spec §6.2). */
  readonly invitationNotifier?: InvitationNotifier;
  /** Randomness for invitation tokens (defaults to `crypto.randomBytes`). */
  readonly randomBytes?: RandomBytes;
};

export type CoreServer = {
  /** `/v1` handlers by endpoint id (filled by SP1 Tasks 9–18). */
  readonly routes: CoreRoutes;
  /** Bearer verification for other runtimes (SP3's Mastra auth provider). */
  readonly verifyBearer: VerifyBearer;
  readonly access: AccessCore;
  /** Access write side: grants, roles, claims sync (SP1 Task 9). */
  readonly accessServices: AccessServices;
  /** Members, grant listing and invitations (SP1 Task 11). */
  readonly members: MemberServices;
  /** Organizations, projects, units and regional settings (SP1 Task 10). */
  readonly tenancy: TenancyServices;
  /** `/v1/me*`: profile, active organization, claims sync, access context (SP1 Task 12). */
  readonly identity: IdentityServices;
  /** Web and desktop sessions (SP1 Task 13). */
  readonly sessions: SessionServices;
  /** Scoped API keys (SP1 Task 14): the `service` principal path. */
  readonly apiKeys: ApiKeyServices;
  /** Device activations and devices (SP1 Task 15): the `device` principal path. */
  readonly devices: DeviceServices;
  /** Platform staff and read-only impersonation (SP1 Task 16); `grantPlatformStaff` is operator tooling only. */
  readonly platform: PlatformServices;
  /** Four-eyes approval requests (SP1 Task 17); `approvals.handlers.register` is open to SP3 and SP5. */
  readonly approvals: ApprovalServices;
  /** Tenant audit log listing (SP1 Task 18), the SP5 audit viewer. */
  readonly auditLogs: AuditLogServices;
  /** Server Action bodies for SP2's `(auth)/actions.ts` (decision 0007). */
  readonly sessionActions: SessionActions;
  /** RSC guards for SP2's `(app)` and `/admin` layouts. */
  readonly sessionGuards: SessionGuards;
  /**
   * SP3 hook (SP1 spec §10): effective permissions and regional settings of a principal at a
   * node, or null (fail-closed). Also exported as `resolveAccessContext` of `identity`.
   */
  readonly resolveAccessContext: ResolveAccessContext;
  /** Module settings store (SP2 Task 9, decision 0015 §6). */
  readonly moduleSettings: ModuleSettingsServices;
  /** Unit types declared by the installed modules, in module order (for tenancy). */
  readonly moduleUnitTypes: readonly UnitTypeDefinition[];
  readonly audit: AuditWriter;
  /** The dependencies every `withApiRoute` of this server shares. */
  readonly pipeline: ApiRouteDeps;
};

type CoreServerArgs = {
  /**
   * `ORGANIZATION_SELF_SERVE` defaults to true (SP1 spec §6.1); `NEXT_PUBLIC_APP_URL` builds
   * invitation links (a server without it refuses to create invitations).
   */
  env: {
    readonly API_KEY_PREFIX: string;
    readonly ORGANIZATION_SELF_SERVE?: boolean;
    readonly NEXT_PUBLIC_APP_URL?: string;
    /** Per-IP rate limits read the client IP behind this many trusted proxies (default 1). */
    readonly TRUSTED_PROXY_HOPS?: number;
    /** Web session cookie lifetime (default 5) and desktop session sliding lifetime (default 30). */
    readonly SESSION_MAX_AGE_DAYS?: number;
    readonly DESKTOP_SESSION_MAX_AGE_DAYS?: number;
  };
  firebase: FirebaseAdmin;
  logger: Logger;
  clock?: Clock;
  modules?: readonly CoreServerModule[];
  /** Approval handlers known at startup; later ones register on `approvals.handlers`. */
  approvalHandlers?: readonly ApprovalActionHandler[];
  adapters?: CoreServerAdapters;
};

const buildAccess = (args: CoreServerArgs, clock: Clock, audit: AuditWriter, apiKeys: ApiKeyServices) => {
  const { firestore, auth } = args.firebase;
  const adapters = args.adapters?.access ?? createFirestoreAccessAdapters({ firestore, auth });
  const readers = args.adapters?.accessReaders ?? adapters.readers;
  const core = createAccessCore({
    permissions: (args.modules ?? []).map((module) => ({ moduleId: module.id, permissions: module.permissions ?? [] })),
    readers,
    clock,
  });
  const syncClaims = makeSyncClaims({ users: adapters.users, projections: adapters.projections, principals: readers.principals, claims: adapters.claims, logger: args.logger });
  const writeDeps: AccessWriteDeps = {
    registry: core.registry,
    memberships: adapters.memberships,
    roles: adapters.roles,
    roleReader: readers.roles,
    projections: adapters.projections,
    users: adapters.users,
    tenantGuard: adapters.tenantGuard,
    audit,
    unitOfWork: createFirestoreUnitOfWork({ firestore }),
    clock,
    syncClaims,
  };
  const members = createMemberServices({
    ...writeDeps,
    invitations: adapters.invitations,
    directory: adapters.directory,
    organizations: adapters.organizations,
    notifier: args.adapters?.invitationNotifier ?? createNoopInvitationNotifier({ logger: args.logger }),
    apiKeys: args.adapters?.apiKeyRevoker ?? apiKeys.revoker,
    randomBytes: args.adapters?.randomBytes ?? randomBytes,
    appUrl: args.env.NEXT_PUBLIC_APP_URL,
    logger: args.logger,
  });
  return { core, readers, services: createAccessServices(writeDeps), members };
};

const buildTenancy = (args: CoreServerArgs, clock: Clock, audit: AuditWriter, access: AccessServices, adapters: FirestoreTenancyAdapters): TenancyServices => {
  const { firestore, auth } = args.firebase;
  return createTenancyServices({
    unitTypes: (args.modules ?? []).flatMap((module) => module.unitTypes ?? []),
    ...adapters,
    access,
    accounts: createFirebaseUserAccountReader({ auth }),
    audit,
    unitOfWork: createFirestoreUnitOfWork({ firestore }),
    clock,
    selfServe: args.env.ORGANIZATION_SELF_SERVE ?? true,
  });
};

/**
 * Builds the core server once per process. Adapters keep references only, so building
 * touches neither Firestore nor Auth.
 * @param env `API_KEY_PREFIX` of the validated services env.
 * @param modules installed modules: their permissions join the registry, their settings are
 *   served under `/v1/.../module-settings/{moduleId}` and their unit types are exposed for tenancy.
 * @throws {PermissionRegistryError} when module permissions conflict (startup bug).
 * @throws {UnitTypeRegistryError} when module unit types conflict (startup bug).
 * @throws {ModuleSettingsRegistryError} when two modules declare settings under one id.
 */
export const createCoreServer = (args: CoreServerArgs): CoreServer => {
  const clock = args.clock ?? systemClock;
  const { firestore, auth } = args.firebase;
  const audit = makeRecordAudit({ writer: createFirestoreAuditLogWriter({ firestore }), clock });
  const apiKeys = createFirestoreApiKeyServices({
    firestore,
    audit,
    clock,
    randomBytes: args.adapters?.randomBytes ?? randomBytes,
    logger: args.logger,
    apiKeyPrefix: args.env.API_KEY_PREFIX,
  });
  const access = buildAccess(args, clock, audit, apiKeys);
  const tenancyAdapters = args.adapters?.tenancy ?? createFirestoreTenancyAdapters({ firestore });
  const tenancy = buildTenancy(args, clock, audit, access.services, tenancyAdapters);
  const identity = createIdentityServices({
    users: createFirestoreUserRepository({ firestore }),
    accounts: createFirebaseAuthAccountReader({ auth }),
    staff: access.readers.principals,
    access: access.core,
    projections: access.services.projections,
    membership: access.services,
    syncClaims: access.services.syncClaims,
    organizations: tenancyAdapters.organizations,
    loadNode: tenancy.loadNode,
    mayCreateOrganization: tenancy.mayCreateOrganization,
    audit,
    unitOfWork: createFirestoreUnitOfWork({ firestore }),
    clock,
  });
  const platform = createFirestorePlatformServices({
    firestore,
    customTokens: createFirebaseCustomTokenIssuer({ auth }),
    syncClaims: access.services.syncClaims,
    audit,
    clock,
    logger: args.logger,
  });
  const approvals = createFirestoreApprovalServices({
    firestore,
    handlers: args.approvalHandlers,
    accessCore: access.core,
    principals: access.readers.principals,
    audit,
    clock,
    logger: args.logger,
  });
  const auditLogs = createFirestoreAuditLogServices({ firestore });
  const verifyBearer = makeVerifyBearer({
    tokenVerifier: args.adapters?.tokenVerifier ?? createFirebaseTokenVerifier({ auth }),
    apiKeyAuthenticator: args.adapters?.apiKeyAuthenticator ?? apiKeys.authenticator,
    apiKeyPrefix: args.env.API_KEY_PREFIX,
  });
  const pipeline: ApiRouteDeps = {
    logger: args.logger,
    clock,
    rateLimiter: createFirestoreRateLimiter({ firestore, clock }),
    idempotency: createFirestoreIdempotencyStore({ firestore, clock }),
    verifyBearer,
    apiKeyPrefix: args.env.API_KEY_PREFIX,
    ...(args.env.TRUSTED_PROXY_HOPS === undefined ? {} : { trustedProxyHops: args.env.TRUSTED_PROXY_HOPS }),
    access: access.core,
    audit,
    onImpersonatedRequest: platform.auditImpersonatedRequest,
  };
  const sessionVertical = createFirebaseSessionVertical({
    firebase: args.firebase,
    principals: access.readers.principals,
    audit,
    clock,
    logger: args.logger,
    randomBytes: args.adapters?.randomBytes ?? randomBytes,
    env: args.env,
  });
  const { sessions } = sessionVertical;
  const devices = createFirestoreDeviceServices({
    firestore,
    access: access.services,
    accessCore: access.core,
    customTokens: sessionVertical.customTokens,
    authUsers: sessionVertical.authUsers,
    audit,
    clock,
    randomBytes: args.adapters?.randomBytes ?? randomBytes,
    logger: args.logger,
  });
  const modules = args.modules ?? [];
  const moduleSettings = createFirestoreModuleSettingsServices({ firestore, definitions: moduleSettingsDefinitionsOf(modules), audit, clock });
  const routes = {
    ...buildCoreRoutes({ pipeline, access: access.services, members: access.members, tenancy, identity, sessions, apiKeys, devices, platform, approvals, auditLogs }),
    ...buildModuleSettingsRoutes({ pipeline, moduleSettings }),
  };
  const moduleUnitTypes = modules.flatMap((module) => module.unitTypes ?? []);
  return {
    routes,
    verifyBearer,
    access: access.core,
    accessServices: access.services,
    members: access.members,
    tenancy,
    identity,
    resolveAccessContext: identity.resolveAccessContext,
    moduleSettings,
    moduleUnitTypes,
    sessions,
    apiKeys,
    devices,
    platform,
    approvals,
    auditLogs,
    sessionActions: sessionVertical.sessionActions,
    sessionGuards: sessionVertical.sessionGuards,
    audit,
    pipeline,
  };
};
