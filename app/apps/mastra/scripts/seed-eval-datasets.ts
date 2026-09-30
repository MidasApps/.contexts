// `pnpm evals:seed`: copies the versioned eval sets (packages/agents/evals/datasets)
// into Mastra datasets in the Mastra storage, so Studio and experiments see the same
// cases the CI gate runs (decision 0028). Idempotent; outside local it needs
// `--confirm-env` like `db:init`. Run `db:init` first (tables `mastra_datasets*`).
import { existsSync } from "node:fs";
import path from "node:path";
import { EVAL_AGENT_IDS, loadEvalDataset, seedEvalDatasets } from "@core/agents";
import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";
import { buildStorageConfig } from "../src/mastra/mastra-options.ts";
import { assertStorageInitConfirmed, loadStorageInitEnv } from "../src/storage/storage-init-target.ts";

const ENV_FILE = path.resolve(import.meta.dirname, "../../../.env.local");

const print = (line: string): void => {
  process.stdout.write(`[evals:seed] ${line}\n`);
};

const main = async (): Promise<void> => {
  // Never overrides a variable already set in the shell.
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const env = loadStorageInitEnv(process.env);
  assertStorageInitConfirmed(env.APP_ENV, process.argv.slice(2));
  const storage = new PostgresStore(buildStorageConfig(env, { init: "force" }));
  try {
    const mastra = new Mastra({ storage });
    const outcomes = await seedEvalDatasets({ mastra, datasets: EVAL_AGENT_IDS.map((agentId) => loadEvalDataset(agentId)) });
    for (const outcome of outcomes) print(`${outcome.name}: ${outcome.status} (${outcome.itemCount} cases)`);
  } finally {
    await storage.close();
  }
};

try {
  await main();
} catch (error: unknown) {
  // Env errors name variables only; driver errors carry no credentials.
  print(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
