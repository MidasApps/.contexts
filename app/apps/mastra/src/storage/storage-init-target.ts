import { loadServicesEnv, type ServicesEnv } from "@core/services";

/** Thrown when `db:init` would run DDL on a remote database nobody confirmed. */
export class UnconfirmedStorageInitError extends Error {
  readonly code = "UNCONFIRMED_STORAGE_INIT";

  constructor(appEnv: string) {
    super(`refusing to init Mastra storage: APP_ENV=${appEnv} needs --confirm-env ${appEnv}`);
    this.name = "UnconfirmedStorageInitError";
  }
}

/**
 * Same rule as `pnpm db:migrate`: local runs freely, any other APP_ENV needs
 * `--confirm-env <APP_ENV>` so a shell pointed at staging/prod never runs DDL by accident.
 * @throws {UnconfirmedStorageInitError} when the flag is missing or names another env.
 */
export const assertStorageInitConfirmed = (appEnv: string, argv: readonly string[]): void => {
  if (appEnv === "local") return;
  const index = argv.indexOf("--confirm-env");
  if (index === -1 || argv[index + 1] !== appEnv) throw new UnconfirmedStorageInitError(appEnv);
};

/**
 * Re-grants DML on Mastra's tables to `mastra_runtime` (migration 0001) after
 * `storage.init()`: default privileges only cover tables created by the role
 * that ran the migration, and Mastra upgrades may add tables.
 */
export const MASTRA_RUNTIME_GRANTS_SQL = `
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'mastra_runtime') THEN
    GRANT USAGE ON SCHEMA mastra TO mastra_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA mastra TO mastra_runtime;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA mastra TO mastra_runtime;
  END IF;
END
$$;`;

/** What `db:init` reads: APP_ENV and DATABASE_URL (with the services rules). */
export type StorageInitEnv = Pick<ServicesEnv, "APP_ENV" | "DATABASE_URL">;

/**
 * Env of `db:init`: only the services env (APP_ENV, DATABASE_URL and its
 * local/remote rules), never the agent runtime env, so a deploy step that runs
 * DDL needs no AI provider or MCP keys.
 * @throws {InvalidEnvError} naming each invalid variable, never its value.
 */
export const loadStorageInitEnv = (source: Record<string, string | undefined>): StorageInitEnv => {
  const { APP_ENV, DATABASE_URL } = loadServicesEnv(source);
  return { APP_ENV, DATABASE_URL };
};
