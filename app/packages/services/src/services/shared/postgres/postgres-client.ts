import postgres, { type Options, type Sql } from "postgres";
import { parseDatabaseUrl } from "./database-url.ts";

type PostgresOptions = Options<Record<string, postgres.PostgresType>>;

/** Pool settings callers may tune; everything else comes from `DATABASE_URL`. */
export type PostgresPoolOptions = { max?: number; connectTimeoutSeconds?: number };

export type PostgresConnection = { url: string | undefined; options: PostgresOptions };

const DEFAULT_POOL_MAX = 10;
const DEFAULT_CONNECT_TIMEOUT_SECONDS = 10;

/** Thrown when `DATABASE_URL` skipped env validation (bug). */
export class InvalidDatabaseUrlError extends Error {
  readonly code = "INVALID_DATABASE_URL";

  constructor() {
    super("DATABASE_URL is not a supported postgres DSN");
    this.name = "InvalidDatabaseUrlError";
  }
}

/**
 * Driver arguments for a validated `DATABASE_URL`: a TCP URL goes as is; the
 * Cloud SQL socket form becomes `host`/`port`/`database`/`username` options,
 * which postgres.js turns into `<host>/.s.PGSQL.<port>`.
 */
export const buildPostgresConnection = (
  env: { DATABASE_URL: string },
  pool: PostgresPoolOptions = {},
): PostgresConnection => {
  const target = parseDatabaseUrl(env.DATABASE_URL);
  if (target === undefined) throw new InvalidDatabaseUrlError();
  const base: PostgresOptions = {
    max: pool.max ?? DEFAULT_POOL_MAX,
    connect_timeout: pool.connectTimeoutSeconds ?? DEFAULT_CONNECT_TIMEOUT_SECONDS,
    // Server notices (e.g. "schema already exists") are not application logs.
    onnotice: () => {},
  };
  if (target.kind === "tcp") return { url: target.url, options: base };
  return {
    url: undefined,
    options: {
      ...base,
      host: target.socketDir,
      port: target.port,
      database: target.database,
      username: target.username,
      ...(target.password === undefined ? {} : { password: target.password }),
    },
  };
};

/** One pool per process; callers `end()` it on shutdown. */
export const createPostgresClient = (env: { DATABASE_URL: string }, pool: PostgresPoolOptions = {}): Sql => {
  const { url, options } = buildPostgresConnection(env, pool);
  return url === undefined ? postgres(options) : postgres(url, options);
};
