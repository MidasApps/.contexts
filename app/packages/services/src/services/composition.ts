// Composition root of the core server: builds every adapter once per process and binds the
// `/v1` pipeline, the access core, the access write side and the audit writer. Apps call it lazily.
import { randomBytes } from "node:crypto";
import type { PermissionDefinition, UnitTypeDefinition } from "@core/contracts";
import { createFirestoreAccessAdapters, type FirestoreAccessAdapters } from "./access/adapters/driven/firestore-access-adapters.ts";
import { createNoopInvitationNotifier } from "./access/adapters/driven/noop-invitation-notifier.ts";
import type { AccessWriteDeps } from "./access/application/access-write-deps.ts";
import type { AccessReaders } from "./access/application/ports/driven/access-readers.ts";
import type { InvitationNotifier } from "./access/application/ports/driven/invitation-notifier.ts";
import { makeSyncClaims } from "./access/application/use-cases/sync-claims.ts";
import { createAccessCore, createAccessServices, type AccessCore, type AccessServices } from "./access/composition.ts";
import type { RandomBytes } from "./access/domain/invitation-token.ts";
import { createMemberServices, type MemberServices } from "./access/member-composition.ts";
import { createFirestoreAuditLogWriter } from "./audit/adapters/driven/firestore-audit-log-writer.ts";
import { makeRecordAudit, type AuditWriter } from "./audit/application/use-cases/record-audit.ts";
import { buildCoreRoutes, type CoreRoutes } from "./core-routes.ts";
import { createFirebaseTokenVerifier } from "./identity/adapters/driven/firebase-token-verifier.ts";
import { refuseAllApiKeys, type ApiKeyAuthenticator } from "./identity/application/ports/driven/api-key-authenticator.ts";
import { noopApiKeyRevoker, type ApiKeyRevoker } from "./identity/application/ports/driven/api-key-revoker.ts";
import type { TokenVerifier } from "./identity/application/ports/driven/token-verifier.ts";
import { createFirebaseUserAccountReader } from "./identity/adapters/driven/firebase-user-account-reader.ts";
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

export { createRouteResolver, UnknownEndpointError, type CoreRoutes } from "./core-routes.ts";

/** What a module contributes to the server; a `defineModule` manifest (decision 0015) satisfies it. */
export type CoreServerModule = {
  readonly id: string;
  readonly permissions?: readonly PermissionDefinition[];
  /** Unit types for tenancy (`createTenancyServices({ unitTypes })`, SP1 Task 10 wires them). */
  readonly unitTypes?: readonly UnitTypeDefinition[] | undefined;
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
  /** Stand-in until the API keys vertical (SP1 Task 14) provides the Firestore revoker. */
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
  readonly audit: AuditWriter;
  /** The dependencies every `withApiRoute` of this server shares. */
  readonly pipeline: ApiRouteDeps;
};

type CoreServerArgs = {
  /**
   * `ORGANIZATION_SELF_SERVE` defaults to true (SP1 spec §6.1); `NEXT_PUBLIC_APP_URL` builds
   * invitation links (a server without it refuses to create invitations).
   */
  env: { readonly API_KEY_PREFIX: string; readonly ORGANIZATION_SELF_SERVE?: boolean; readonly NEXT_PUBLIC_APP_URL?: string };
  firebase: FirebaseAdmin;
  logger: Logger;
  clock?: Clock;
  modules?: readonly CoreServerModule[];
  adapters?: CoreServerAdapters;
};

const buildAccess = (args: CoreServerArgs, clock: Clock, audit: AuditWriter) => {
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
    apiKeys: args.adapters?.apiKeyRevoker ?? noopApiKeyRevoker,
    randomBytes: args.adapters?.randomBytes ?? randomBytes,
    appUrl: args.env.NEXT_PUBLIC_APP_URL,
    logger: args.logger,
  });
  return { core, services: createAccessServices(writeDeps), members };
};

const buildTenancy = (args: CoreServerArgs, clock: Clock, audit: AuditWriter, access: AccessServices): TenancyServices => {
  const { firestore, auth } = args.firebase;
  return createTenancyServices({
    unitTypes: (args.modules ?? []).flatMap((module) => module.unitTypes ?? []),
    ...(args.adapters?.tenancy ?? createFirestoreTenancyAdapters({ firestore })),
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
 * @param modules installed modules (their permissions join the registry).
 * @throws {PermissionRegistryError} when module permissions conflict (startup bug).
 * @throws {UnitTypeRegistryError} when module unit types conflict (startup bug).
 */
export const createCoreServer = (args: CoreServerArgs): CoreServer => {
  const clock = args.clock ?? systemClock;
  const { firestore, auth } = args.firebase;
  const audit = makeRecordAudit({ writer: createFirestoreAuditLogWriter({ firestore }), clock });
  const access = buildAccess(args, clock, audit);
  const tenancy = buildTenancy(args, clock, audit, access.services);
  const verifyBearer = makeVerifyBearer({
    tokenVerifier: args.adapters?.tokenVerifier ?? createFirebaseTokenVerifier({ auth }),
    apiKeyAuthenticator: args.adapters?.apiKeyAuthenticator ?? refuseAllApiKeys,
    apiKeyPrefix: args.env.API_KEY_PREFIX,
  });
  const pipeline: ApiRouteDeps = {
    logger: args.logger,
    clock,
    rateLimiter: createFirestoreRateLimiter({ firestore, clock }),
    idempotency: createFirestoreIdempotencyStore({ firestore, clock }),
    verifyBearer,
    apiKeyPrefix: args.env.API_KEY_PREFIX,
    access: access.core,
    audit,
  };
  const routes = buildCoreRoutes({ pipeline, access: access.services, members: access.members, tenancy });
  return { routes, verifyBearer, access: access.core, accessServices: access.services, members: access.members, tenancy, audit, pipeline };
};
