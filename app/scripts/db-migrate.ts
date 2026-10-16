// `pnpm db:migrate` (root): applies the core's SQL migrations in infra/postgres/migrations
// (decision 0023), then the migrations of each module listed in migrations.modules.ts, each with
// its own journal table, and checks every module's schema against the convention (decision 0077).
// An explicit pipeline step, never run at app boot (rules/migration.md §2). Refuses anything but
// the local container unless `--confirm-env <APP_ENV>` names the target (src/db/migrate-target.ts).
import { existsSync } from "node:fs";
import path from "node:path";
import { createPostgresClient } from "@core/services";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { applyModuleMigrations } from "./src/db/apply-module-migrations.ts";
import { resolveMigrateTarget } from "./src/db/migrate-target.ts";
import { loadModuleMigrations } from "./src/db/module-migrations.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "..");
const ENV_FILE = path.join(WORKSPACE_ROOT, ".env.local");
const MIGRATIONS_FOLDER = path.join(WORKSPACE_ROOT, "infra/postgres/migrations");

const print = (line: string): void => {
  process.stdout.write(`[db:migrate] ${line}\n`);
};

const main = async (): Promise<void> => {
  // Never overrides a variable already set in the shell (CI sets its own).
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const target = resolveMigrateTarget(process.env, process.argv.slice(2));
  // Loaded before the first statement: a malformed list changes nothing in the database.
  const modules = await loadModuleMigrations(WORKSPACE_ROOT);
  const sql = createPostgresClient({ DATABASE_URL: target.databaseUrl }, { max: 1 });
  try {
    print(`applying ${MIGRATIONS_FOLDER} to APP_ENV=${target.appEnv}`);
    await migrate(drizzle({ client: sql }), {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: "migrations",
      migrationsTable: "drizzle_migrations",
    });
    for (const module of modules) {
      print(`applying the migrations of module ${module.moduleId}`);
      await applyModuleMigrations(sql, module);
    }
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
