// Composition root of the core server: builds every adapter once per process and binds the
// `/v1` pipeline, the access core and the audit writer (SP1 Task 8). Apps call it lazily.
import type { PermissionDefinition } from "@core/contracts";
import { createAccessCore, type AccessCore } from "./access/composition.ts";
import type { AccessReaders } from "./access/application/ports/driven/access-readers.ts";
import { createFirestoreAuditLogWriter } from "./audit/adapters/driven/firestore-audit-log-writer.ts";
import { makeRecordAudit, type AuditWriter } from "./audit/application/use-cases/record-audit.ts";
import { buildCoreRoutes, type CoreRoutes } from "./core-routes.ts";

export { createRouteResolver, UnknownEndpointError, type CoreRoutes } from "./core-routes.ts";
import { createFirebaseTokenVerifier } from "./identity/adapters/driven/firebase-token-verifier.ts";
import { refuseAllApiKeys, type ApiKeyAuthenticator } from "./identity/application/ports/driven/api-key-authenticator.ts";
import { makeVerifyBearer, type VerifyBearer } from "./identity/application/use-cases/resolve-principal.ts";
import { systemClock, type Clock } from "./shared/clock/clock.ts";
import type { FirebaseAdmin } from "./shared/firebase/firebase-admin.ts";
import type { ApiRouteDeps } from "./shared/http/api-route.ts";
import { createFirestoreIdempotencyStore } from "./shared/idempotency/firestore-idempotency-store.ts";
import type { Logger } from "./shared/observability/logger.ts";
import { createFirestoreRateLimiter } from "./shared/rate-limit/firestore-rate-limiter.ts";

/** What a module contributes to the server; a `defineModule` manifest (decision 0015) satisfies it. */
export type CoreServerModule = { readonly id: string; readonly permissions?: readonly PermissionDefinition[] };

/** Adapters a caller may replace (tests, and later tasks until their Firestore adapters land). */
export type CoreServerAdapters = {
  readonly accessReaders?: AccessReaders;
  readonly apiKeyAuthenticator?: ApiKeyAuthenticator;
};

export type CoreServer = {
  /** `/v1` handlers by endpoint id (filled by SP1 Tasks 10–18). */
  readonly routes: CoreRoutes;
  /** Bearer verification for other runtimes (SP3's Mastra auth provider). */
  readonly verifyBearer: VerifyBearer;
  readonly access: AccessCore;
  readonly audit: AuditWriter;
  /** The dependencies every `withApiRoute` of this server shares. */
  readonly pipeline: ApiRouteDeps;
};

/** Bug guard: the access readers are not wired yet; every decision rejects (500), never allows. */
export class AccessReadersNotWiredError extends Error {
  readonly code = "ACCESS_READERS_NOT_WIRED";

  constructor() {
    super("ACCESS_READERS_NOT_WIRED: pass adapters.accessReaders (Firestore readers arrive in SP1 Task 9)");
    this.name = "AccessReadersNotWiredError";
  }
}

const notWired = (): Promise<never> => Promise.reject(new AccessReadersNotWiredError());

const UNWIRED_ACCESS_READERS: AccessReaders = {
  grants: { listGrants: notWired },
  roles: { getRoles: notWired },
  nodeChains: { loadChain: notWired },
  principals: {
    getUser: notWired,
    getDevice: notWired,
    getApiKey: notWired,
    getPlatformStaff: notWired,
    getImpersonationSession: notWired,
  },
};

/**
 * Builds the core server once per process.
 * @param env `API_KEY_PREFIX` of the validated services env.
 * @param modules installed modules (their permissions join the registry).
 * @throws {PermissionRegistryError} when module permissions conflict (startup bug).
 */
export const createCoreServer = (args: {
  env: { readonly API_KEY_PREFIX: string };
  firebase: FirebaseAdmin;
  logger: Logger;
  clock?: Clock;
  modules?: readonly CoreServerModule[];
  adapters?: CoreServerAdapters;
}): CoreServer => {
  const clock = args.clock ?? systemClock;
  const { firestore, auth } = args.firebase;
  const access = createAccessCore({
    permissions: (args.modules ?? []).map((module) => ({ moduleId: module.id, permissions: module.permissions ?? [] })),
    readers: args.adapters?.accessReaders ?? UNWIRED_ACCESS_READERS,
    clock,
  });
  const audit = makeRecordAudit({ writer: createFirestoreAuditLogWriter({ firestore }), clock });
  const verifyBearer = makeVerifyBearer({
    tokenVerifier: createFirebaseTokenVerifier({ auth }),
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
    access,
    audit,
  };
  return { routes: buildCoreRoutes(pipeline), verifyBearer, access, audit, pipeline };
};
