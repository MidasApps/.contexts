import { Mastra } from "@mastra/core";
import { PinoLogger } from "@mastra/loggers";
import { MastraStorageExporter, Observability } from "@mastra/observability";
import { PostgresStore } from "@mastra/pg";
import { env } from "../env.ts";
import { configureMastraProcessLogger } from "./process-log-context.ts";
import { buildLoggerOptions, buildServerConfig, buildStorageConfig, MASTRA_SERVICE_NAME } from "./mastra-options.ts";

configureMastraProcessLogger(env);

/**
 * Mastra entry (`mastra dev` / `mastra build` look for this file and this
 * export name). Agents, workflows and the auth provider arrive in SP3; SP0
 * only boots the server with storage, logs and traces.
 */
export const mastra = new Mastra({
  storage: new PostgresStore(buildStorageConfig(env)),
  logger: new PinoLogger(buildLoggerOptions(env)),
  // Spans go to Mastra storage (Studio reads them); SensitiveDataFilter is on
  // by default. OTLP to Cloud Trace is added with the tracing work (spec §10).
  observability: new Observability({
    configs: { default: { serviceName: MASTRA_SERVICE_NAME, exporters: [new MastraStorageExporter()] } },
  }),
  server: buildServerConfig(env),
});
