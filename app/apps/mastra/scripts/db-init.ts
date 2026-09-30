// `pnpm -F @core/mastra db:init`: creates and migrates Mastra's tables in schema
// `mastra` with init forced on, plus the memory vector index `memory_messages`
// (decision 0029: the runtime role cannot create it), then exits (decision 0023,
// SP0 follow-up #1).
// Deploy order: `pnpm db:migrate` -> this step (same DDL-capable role) -> deploy
// with MASTRA_STORAGE_INIT=skip. Idempotent: safe to run on every deploy.
import { existsSync } from "node:fs";
import path from "node:path";
import { MEMORY_VECTOR_DIMENSIONS, MEMORY_VECTOR_INDEX } from "@core/agents";
import { PgVector, PostgresStore } from "@mastra/pg";
import { buildMemoryVectorConfig, buildStorageConfig } from "../src/mastra/mastra-options.ts";
import { assertStorageInitConfirmed, loadStorageInitEnv, MASTRA_RUNTIME_GRANTS_SQL } from "../src/storage/storage-init-target.ts";

const ENV_FILE = path.resolve(import.meta.dirname, "../../../.env.local");

const print = (line: string): void => {
  process.stdout.write(`[db:init] ${line}\n`);
};

const main = async (): Promise<void> => {
  // Never overrides a variable already set in the shell (deploy sets its own).
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  // Services env only: DDL needs no AI provider or MCP keys.
  const env = loadStorageInitEnv(process.env);
  assertStorageInitConfirmed(env.APP_ENV, process.argv.slice(2));
  const store = new PostgresStore(buildStorageConfig(env, { init: "force" }));
  const vector = new PgVector(buildMemoryVectorConfig(env, { init: "force" }));
  try {
    await store.init();
    // Same parameters as Memory.createEmbeddingIndex, so the runtime finds it and never runs DDL.
    await vector.createIndex({ indexName: MEMORY_VECTOR_INDEX, dimension: MEMORY_VECTOR_DIMENSIONS, metric: "cosine", metadataIndexes: ["thread_id", "resource_id"] });
    await store.db.none(MASTRA_RUNTIME_GRANTS_SQL);
    print(`mastra storage ready (APP_ENV=${env.APP_ENV})`);
  } finally {
    await vector.disconnect();
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
