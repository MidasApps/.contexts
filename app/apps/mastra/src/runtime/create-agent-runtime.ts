import { composeAgentRuntime, createHarnessPromptEvalRunner, type RuntimeParts } from "@core/agents";
import { createFirebaseAdmin, type FirebaseAdmin, processLogger } from "@core/services";
import type { MastraCompositeStore } from "@mastra/core/storage";
import type { MastraVector } from "@mastra/core/vector";
import { PgVector, PostgresStore } from "@mastra/pg";
import { buildMemoryVectorConfig, buildStorageConfig, MASTRA_SERVICE_NAME } from "../mastra/mastra-options.ts";
import type { MastraEnv } from "../mastra-env.schema.ts";
import type { AppModule } from "../modules.ts";
import { createRuntimePorts, type RuntimePortsAdapters } from "./create-runtime-ports.ts";
import { withExperimentSource } from "./eval-export-source.ts";

export type AgentRuntimeOverrides = {
  readonly firebase?: FirebaseAdmin;
  readonly storage?: MastraCompositeStore;
  readonly vector?: MastraVector;
  readonly adapters?: RuntimePortsAdapters;
  readonly observability?: Parameters<typeof composeAgentRuntime>[0]["exporters"];
};

/**
 * The runtime parts of this app: SP1/SP3 ports bound once (the modules' manifests and
 * commands join SP1's registries and the command registry), then composed with the modules'
 * agent capabilities, which are built over those ports. `src/mastra/index.ts` spreads them into
 * `new Mastra({...})`; the emulator test passes in-memory overrides.
 * @param processEnv the raw environment, only for the Firebase emulator guard.
 */
export const createAgentRuntime = (args: {
  env: MastraEnv;
  processEnv: Record<string, string | undefined>;
  modules: readonly AppModule[];
  overrides?: AgentRuntimeOverrides;
}): RuntimeParts => {
  const { env, overrides = {} } = args;
  const firebase = overrides.firebase ?? createFirebaseAdmin({ env, processEnv: args.processEnv });
  const base = createRuntimePorts({ env, firebase, logger: processLogger, modules: args.modules, ...(overrides.adapters === undefined ? {} : { adapters: overrides.adapters }) });
  const storage = overrides.storage ?? new PostgresStore(buildStorageConfig(env));
  // The eval export reads finished experiments from the same Mastra storage (decision 0040).
  const ports = { ...base, evalExport: withExperimentSource(base.evalExport, storage) };
  return composeAgentRuntime({
    env,
    ports,
    modules: args.modules.map((module) => module.createAgentModule({ ports })),
    storage,
    vector: overrides.vector ?? new PgVector(buildMemoryVectorConfig(env)),
    serviceName: MASTRA_SERVICE_NAME,
    // Decision 0038: candidate prompts run on the isolated eval harness (real mode reads the provider keys).
    promptEvalRunner: createHarnessPromptEvalRunner({ mode: env.AI_MODE, processEnv: args.processEnv }),
    ...(overrides.observability === undefined ? {} : { exporters: overrides.observability }),
  });
};
