import type { Config } from "@mastra/core/mastra";
import type { PinoLoggerOptions } from "@mastra/loggers";
import type { MastraEnv } from "../mastra-env.schema.ts";

/** `ServerConfig` is not exported by @mastra/core 1.71.0; derive it from `Config`. */
type ServerConfig = NonNullable<Config["server"]>;

/** Service name on logs and traces (rules/observability.md). */
export const MASTRA_SERVICE_NAME = "mastra";
/** Postgres schema created by infra/postgres/init; Mastra owns every table in it. */
export const MASTRA_STORAGE_SCHEMA = "mastra";

/** PostgresStore options: Mastra creates and migrates its tables on first use. */
export const buildStorageConfig = (env: MastraEnv) => ({
  id: "mastra-storage",
  connectionString: env.DATABASE_URL,
  schemaName: MASTRA_STORAGE_SCHEMA,
});

/**
 * CORS: outside local, Mastra is private and only the `/v1` API calls it
 * server to server, so CORS is off (spec §16.3). In local, an explicit
 * allowlist: Studio's own origin plus `MASTRA_CORS_ORIGINS`, never `*`.
 */
const buildCorsConfig = (env: MastraEnv): ServerConfig["cors"] =>
  env.APP_ENV === "local"
    ? { origin: [`http://localhost:${env.PORT}`, ...env.MASTRA_CORS_ORIGINS], credentials: false }
    : false;

/** HTTP server options; Swagger, OpenAPI docs and raw request logs stay off. */
export const buildServerConfig = (env: MastraEnv): ServerConfig => ({
  host: env.MASTRA_HOST,
  port: env.PORT,
  timeout: env.MASTRA_SERVER_TIMEOUT_MS,
  cors: buildCorsConfig(env),
  build: { swaggerUI: false, openAPIDocs: false, apiReqLogs: false },
});

/** Pino mixin adding an ISO `timestamp` to every record. */
export const createTimestampMixin = (now: () => Date) => () => ({ timestamp: now().toISOString() });

/**
 * Pino options for single-line JSON with the fields of rules/observability.md:
 * `timestamp`, `level` (label), `message`, `service`, `env`. Pino still adds
 * its numeric `time`, which the PinoLogger wrapper gives no option to drop.
 */
export const buildLoggerOptions = (env: MastraEnv, now: () => Date = () => new Date()): PinoLoggerOptions => ({
  name: MASTRA_SERVICE_NAME,
  level: env.LOG_LEVEL,
  prettyPrint: false,
  messageKey: "message",
  formatters: {
    level: (label) => ({ level: label }),
    bindings: () => ({ service: MASTRA_SERVICE_NAME, env: env.APP_ENV }),
  },
  mixin: createTimestampMixin(now),
});
