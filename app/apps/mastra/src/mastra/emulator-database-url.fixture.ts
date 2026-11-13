import { parseDatabaseUrl } from "@core/services";

/** The compose Postgres of .env.example (local-only credentials). */
const DEFAULT_DATABASE_URL = "postgresql://app:app@127.0.0.1:5432/app";
/** Same hosts as `pnpm db:migrate` accepts for APP_ENV=local (scripts/src/db/migrate-target.ts). */
const LOCAL_DATABASE_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]", "postgres"]);

/** Thrown before a suite starts when `DATABASE_URL` names a database that is not the local container. */
export class NonLocalTestDatabaseError extends Error {
  readonly code = "NON_LOCAL_TEST_DATABASE";

  constructor() {
    super("refusing to run the emulator suites: DATABASE_URL is not the local Postgres container");
    this.name = "NonLocalTestDatabaseError";
  }
}

/**
 * The database the emulator suites write to: `DATABASE_URL` when the shell sets it (a derived app
 * moves the local Postgres port), the compose default otherwise. Turbo passes the variable through
 * from the shell, so a URL left there for remote work must never reach these suites.
 * @throws {NonLocalTestDatabaseError} when the URL is not a TCP URL on a local host.
 */
export const emulatorDatabaseUrl = (env: Readonly<Record<string, string | undefined>> = process.env): string => {
  const url = env["DATABASE_URL"] ?? DEFAULT_DATABASE_URL;
  const target = parseDatabaseUrl(url);
  if (target?.kind !== "tcp" || !LOCAL_DATABASE_HOSTS.has(target.hostname)) throw new NonLocalTestDatabaseError();
  return url;
};
