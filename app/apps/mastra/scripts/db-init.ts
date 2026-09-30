// `pnpm -F @core/mastra db:init`: creates and migrates Mastra's tables in schema
// `mastra` with init forced on, then exits (decision 0023, SP0 follow-up #1).
// Deploy order: `pnpm db:migrate` -> this step (same DDL-capable role) -> deploy
// with MASTRA_STORAGE_INIT=skip. Idempotent: safe to run on every deploy.
import { existsSync } from "node:fs";
import path from "node:path";
import { PostgresStore } from "@mastra/pg";
import { buildStorageConfig } from "../src/mastra/mastra-options.ts";
import { loadMastraEnv } from "../src/mastra-env.schema.ts";
import { assertStorageInitConfirmed, MASTRA_RUNTIME_GRANTS_SQL } from "../src/storage/storage-init-target.ts";

const ENV_FILE = path.resolve(import.meta.dirname, "../../../.env.local");

const print = (line: string): void => {
  process.stdout.write(`[db:init] ${line}\n`);
};

const main = async (): Promise<void> => {
  // Never overrides a variable already set in the shell (deploy sets its own).
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const env = loadMastraEnv(process.env);
  assertStorageInitConfirmed(env.APP_ENV, process.argv.slice(2));
  const store = new PostgresStore(buildStorageConfig(env, { init: "force" }));
  try {
    await store.init();
    await store.db.none(MASTRA_RUNTIME_GRANTS_SQL);
    print(`mastra storage ready (APP_ENV=${env.APP_ENV})`);
  } finally {
    await store.close();
  }
};

try {
  await main();
} catch (error: unknown) {
  // Env errors name variables only; driver errors carry no credentials.
  print(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
