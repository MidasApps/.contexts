import type { AgentRuntimePorts } from "@core/agents";
import {
  type AccessReaders,
  type ApiKeyAuthenticator,
  createPostgresClient,
  createPostgresSemanticRunner,
  createSemanticViewRegistry,
  type FirebaseAdmin,
  guardSemanticSql,
  type Logger,
  makeRunSemanticQuery,
  type ServicesEnv,
} from "@core/services";
import { type CoreServerModule, createCoreServer } from "@core/services/composition";
import { bindAccessPort, type RegionalSettingsResolver, UNWIRED_REGIONAL_SETTINGS } from "./access-port-binding.ts";
import { bindAuditPort } from "./audit-port-binding.ts";
import { UNWIRED_PORTS } from "./unwired-ports.ts";

export type RuntimePortsEnv = Pick<ServicesEnv, "API_KEY_PREFIX" | "DATABASE_URL">;

/** SP1 adapters that are not wired in `createCoreServer` yet (tests pass in-memory ones). */
export type RuntimePortsAdapters = {
  readonly accessReaders?: AccessReaders;
  readonly apiKeyAuthenticator?: ApiKeyAuthenticator;
  readonly regional?: RegionalSettingsResolver;
};

/**
 * Binds `AgentRuntimePorts` to SP1/SP3 services (spec §3.3, decision 0019).
 * - access: `createCoreServer().verifyBearer` + access core (Firestore readers,
 *   SP1 Task 9); `resolveAccessContext` is an interim adapter over
 *   `getEffectivePermissions` + `regional` until SP1 Task 12 exports it. Until
 *   then the regional port rejects, so every agent request fails closed (401), never opens.
 * - audit: SP1 `AuditWriter` (Firestore `audit-logs`), mapped in `bindAuditPort`.
 * - catalog: `makeRunSemanticQuery` over Postgres (no semantic view is registered yet).
 * - approvals, usage, knowledge, connectors, secrets, settings: fail-closed until their tasks.
 * @param args.modules installed modules (their permissions join SP1's registry).
 */
export const createRuntimePorts = (args: {
  env: RuntimePortsEnv;
  firebase: FirebaseAdmin;
  logger: Logger;
  modules?: readonly CoreServerModule[];
  adapters?: RuntimePortsAdapters;
}): AgentRuntimePorts => {
  const { adapters = {} } = args;
  const core = createCoreServer({
    env: { API_KEY_PREFIX: args.env.API_KEY_PREFIX },
    firebase: args.firebase,
    logger: args.logger,
    ...(args.modules === undefined ? {} : { modules: args.modules }),
    adapters: {
      ...(adapters.accessReaders === undefined ? {} : { accessReaders: adapters.accessReaders }),
      ...(adapters.apiKeyAuthenticator === undefined ? {} : { apiKeyAuthenticator: adapters.apiKeyAuthenticator }),
    },
  });
  // postgres.js connects lazily: no connection until the first semantic query.
  const runner = createPostgresSemanticRunner(createPostgresClient({ DATABASE_URL: args.env.DATABASE_URL }));
  return {
    access: bindAccessPort({ verifyBearer: core.verifyBearer, access: core.access, regional: adapters.regional ?? UNWIRED_REGIONAL_SETTINGS }),
    audit: bindAuditPort(core.audit),
    catalog: { runSemanticQuery: makeRunSemanticQuery({ views: createSemanticViewRegistry([]), guard: guardSemanticSql, runner }) },
    ...UNWIRED_PORTS,
  };
};
