// `pnpm db:migrate` (root): applies the SQL migrations in infra/postgres/migrations
// (decision 0023). An explicit pipeline step, never run at app boot
// (rules/migration.md §2). Refuses anything but the local container unless
// `--confirm-env <APP_ENV>` names the target (src/db/migrate-target.ts).
import { existsSync } from "node:fs";
import path from "node:path";
import { createPostgresClient } from "@core/services";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { resolveMigrateTarget } from "./src/db/migrate-target.ts";

const ENV_FILE = path.resolve(import.meta.dirname, "../.env.local");
const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, "../infra/postgres/migrations");

const print = (line: string): void => {
  process.stdout.write(`[db:migrate] ${line}\n`);
};

const main = async (): Promise<void> => {
  // Never overrides a variable already set in the shell (CI sets its own).
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const target = resolveMigrateTarget(process.env, process.argv.slice(2));
  const sql = createPostgresClient({ DATABASE_URL: target.databaseUrl }, { max: 1 });
  try {
    print(`applying ${MIGRATIONS_FOLDER} to APP_ENV=${target.appEnv}`);
    await migrate(drizzle({ client: sql }), {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: "migrations",
      migrationsTable: "drizzle_migrations",
    });
    print("done");
  } finally {
    await sql.end();
  }
};

try {
  await main();
} catch (error: unknown) {
  // Messages name variables and flags only; driver errors carry no credentials.
  print(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
