import { createPubSub, ensurePlatformSchedules } from "@core/agents";
import { processLogger } from "@core/services";
import { Mastra } from "@mastra/core";
import { PinoLogger } from "@mastra/loggers";
import { env, processEnvForFirebaseGuard } from "../env.ts";
import { APP_MODULES } from "../modules.ts";
import { createAgentRuntime } from "../runtime/create-agent-runtime.ts";
import { buildLoggerOptions, buildServerConfig } from "./mastra-options.ts";
import { configureMastraProcessLogger } from "./process-log-context.ts";

configureMastraProcessLogger(env);

const runtime = createAgentRuntime({ env, processEnv: processEnvForFirebaseGuard, modules: APP_MODULES });

/**
 * Mastra entry (`mastra dev` / `mastra build` look for this file and this
 * export name). `server` stays a literal property here: the build extracts
 * it statically (SP0 spike gotcha); everything else comes from the runtime.
 */
export const mastra = new Mastra({
  agents: runtime.agents,
  workflows: runtime.workflows,
  scorers: runtime.scorers,
  mcpServers: runtime.mcpServers,
  storage: runtime.storage,
  vectors: runtime.vectors,
  logger: new PinoLogger(buildLoggerOptions(env)),
  observability: runtime.observability,
  // `memory` in local, Google Cloud Pub/Sub elsewhere (Task 25); the GCP adapter loads lazily.
  pubsub: await createPubSub(env),
  server: {
    ...buildServerConfig(env),
    auth: runtime.auth,
    middleware: runtime.middleware,
    apiRoutes: runtime.apiRoutes,
    mcpOptions: runtime.mcpOptions,
  },
});

// Platform crons of the core workflows (UTC, decision 0037 amendment). A failure is logged and the
// server still starts: the next boot writes the rows again.
await ensurePlatformSchedules({
  schedules: mastra.schedules,
  specs: runtime.platformSchedules,
  logger: processLogger,
}).catch((error: unknown) => {
  processLogger.error("platform_schedules_failed", { err: error });
});
