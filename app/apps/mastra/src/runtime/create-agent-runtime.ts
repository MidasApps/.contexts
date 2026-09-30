import { type AgentModule, composeAgentRuntime, type RuntimeParts } from "@core/agents";
import { createFirebaseAdmin, type FirebaseAdmin, processLogger } from "@core/services";
import type { MastraCompositeStore } from "@mastra/core/storage";
import { PostgresStore } from "@mastra/pg";
import { buildStorageConfig, MASTRA_SERVICE_NAME } from "../mastra/mastra-options.ts";
import type { MastraEnv } from "../mastra-env.schema.ts";
import { createRuntimePorts, type RuntimePortsAdapters } from "./create-runtime-ports.ts";

export type AgentRuntimeOverrides = {
  readonly firebase?: FirebaseAdmin;
  readonly storage?: MastraCompositeStore;
  readonly adapters?: RuntimePortsAdapters;
  readonly observability?: Parameters<typeof composeAgentRuntime>[0]["exporters"];
};

/**
 * The runtime parts of this app: SP1/SP3 ports bound once, then composed
 * with the app's modules. `src/mastra/index.ts` spreads them into
 * `new Mastra({...})`; the emulator test passes in-memory overrides.
 * @param processEnv the raw environment, only for the Firebase emulator guard.
 */
export const createAgentRuntime = (args: {
  env: MastraEnv;
  processEnv: Record<string, string | undefined>;
  modules: readonly AgentModule[];
  overrides?: AgentRuntimeOverrides;
}): RuntimeParts => {
  const { env, overrides = {} } = args;
  const firebase = overrides.firebase ?? createFirebaseAdmin({ env, processEnv: args.processEnv });
  const ports = createRuntimePorts({ env, firebase, logger: processLogger, ...(overrides.adapters === undefined ? {} : { adapters: overrides.adapters }) });
  return composeAgentRuntime({
    env,
    ports,
    modules: args.modules,
    storage: overrides.storage ?? new PostgresStore(buildStorageConfig(env)),
    serviceName: MASTRA_SERVICE_NAME,
    ...(overrides.observability === undefined ? {} : { exporters: overrides.observability }),
  });
};
