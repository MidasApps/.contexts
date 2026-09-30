import { parseDatabaseUrl } from "@core/services";
import { z } from "zod";

/** Where `pnpm db:migrate` may write (decision 0023). */
export type MigrateTarget = { appEnv: "local" | "dev" | "staging" | "prod"; databaseUrl: string };

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "postgres"]);
const CONFIRM_FLAG = "--confirm-env";

const MigrateEnvSchema = z.object({
  APP_ENV: z.enum(["local", "dev", "staging", "prod"]),
  DATABASE_URL: z.string().refine((value) => parseDatabaseUrl(value) !== undefined),
});

/** Thrown when the env or flags could migrate a database nobody confirmed. */
export class UnsafeMigrateTargetError extends Error {
  readonly code = "UNSAFE_MIGRATE_TARGET";

  constructor(reason: string) {
    super(`refusing to migrate: ${reason}`);
    this.name = "UnsafeMigrateTargetError";
  }
}

const confirmedEnv = (argv: readonly string[]): string | undefined => {
  const index = argv.indexOf(CONFIRM_FLAG);
  return index === -1 ? undefined : argv[index + 1];
};

const isLocalDatabase = (databaseUrl: string): boolean => {
  const target = parseDatabaseUrl(databaseUrl);
  return target?.kind === "tcp" && LOCAL_DATABASE_HOSTS.has(target.hostname);
};

/**
 * Local migrates only the local container; any other APP_ENV needs
 * `--confirm-env <APP_ENV>` (processes/environments.md: no silent cross-env writes).
 * @throws {UnsafeMigrateTargetError} naming variables or the missing flag, never values.
 */
export const resolveMigrateTarget = (
  env: Readonly<Record<string, string | undefined>>,
  argv: readonly string[],
): MigrateTarget => {
  const parsed = MigrateEnvSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new UnsafeMigrateTargetError(`invalid ${names.join(", ")}`);
  }
  const { APP_ENV: appEnv, DATABASE_URL: databaseUrl } = parsed.data;
  if (appEnv === "local" && !isLocalDatabase(databaseUrl)) {
    throw new UnsafeMigrateTargetError("APP_ENV=local but DATABASE_URL is not the local Postgres container");
  }
  if (appEnv !== "local" && confirmedEnv(argv) !== appEnv) {
    throw new UnsafeMigrateTargetError(`APP_ENV=${appEnv} needs ${CONFIRM_FLAG} ${appEnv}`);
  }
  return { appEnv, databaseUrl };
};
