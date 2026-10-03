// `pnpm test:e2e` (root): the Playwright e2e run (SP2 spec §13, SP4 chat journeys) on its own
// stack. Prepares the e2e database in the compose Postgres (`docker compose up -d --wait` first),
// builds the Functions source the emulator loads, starts the emulators of firebase.e2e.json
// (project demo-core-e2e, ports apart from `pnpm dev`), exports the e2e env (src/e2e/e2e-env.ts)
// and runs scripts/e2e-playwright.ts: the builds, then Playwright in web and desktop (follow-up 87).
// The Playwright setup seeds the users; the web and desktop builds get the e2e public config;
// Playwright starts the web and the agent runtime.
// `pnpm test:e2e -- <command>` runs another command in the same stack instead,
// e.g. `pnpm test:e2e -- pnpm -F @core/web exec playwright test e2e/auth.spec.ts`.
// Ports: E2E_WEB_PORT (default 3100), E2E_DESKTOP_PORT (1420), E2E_MASTRA_PORT (4191); never 3000.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolvePackageBin } from "./src/dev/package-bin.ts";
import { ensureE2eDatabase } from "./src/e2e/e2e-database.ts";
import { buildE2eEnv, buildEmulatorExecArgs, DEFAULT_E2E_COMMAND, E2E_FIREBASE_CONFIG, joinCommandArgs } from "./src/e2e/e2e-env.ts";

const APP_ROOT = path.resolve(import.meta.dirname, "..");
const POSTGRES_INIT_DIR = path.join(APP_ROOT, "infra", "postgres", "init");

const print = (line: string): void => {
  process.stdout.write(`[e2e] ${line}\n`);
};

/** Runs a Node script of the workspace to completion; a non-zero exit stops the run. */
const runNodeStep = (label: string, script: string, env: Record<string, string | undefined>): void => {
  print(label);
  const result = spawnSync(process.execPath, [path.join(APP_ROOT, script)], { cwd: APP_ROOT, env, stdio: "inherit", windowsHide: true });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${String(result.status)}`);
};

const main = async (): Promise<number> => {
  const firebaseConfig: unknown = JSON.parse(readFileSync(path.join(APP_ROOT, E2E_FIREBASE_CONFIG), "utf8"));
  const e2eEnv = buildE2eEnv({ firebaseConfig, overrides: process.env });
  const env = { ...process.env, ...e2eEnv };
  const extra = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === "--"));
  const command = extra.length > 0 ? joinCommandArgs(extra) : DEFAULT_E2E_COMMAND;
  const firebaseBin = resolvePackageBin({ fromDir: APP_ROOT, packageName: "firebase-tools", binName: "firebase" });
  print(`project ${e2eEnv["E2E_PROJECT_ID"] ?? ""}, web ${e2eEnv["E2E_WEB_ORIGIN"] ?? ""}, desktop ${e2eEnv["E2E_DESKTOP_ORIGIN"] ?? ""}, agents ${e2eEnv["E2E_MASTRA_ORIGIN"] ?? ""}`);
  // A fresh database each run, except when Playwright reuses servers that already hold it open.
  const fresh = env["E2E_REUSE_SERVERS"] !== "1";
  const created = await ensureE2eDatabase({ databaseUrl: e2eEnv["DATABASE_URL"] ?? "", initDir: POSTGRES_INIT_DIR, fresh });
  print(created ? "created a fresh e2e database" : "reusing the e2e database (E2E_REUSE_SERVERS=1)");
  runNodeStep("applying migrations to the e2e database", path.join("scripts", "db-migrate.ts"), env);
  // The Functions emulator loads apps/functions/lib (the upload validation trigger).
  runNodeStep("building the functions source", path.join("apps", "functions", "build.ts"), env);
  // The Storage Emulator keeps its blobs under the OS temp dir and every emulator suite on the
  // machine shares that folder: another suite starting or stopping wiped it and crashed this one
  // on the next upload. Each e2e stack (keyed by its web port) gets its own temp dir.
  const emulatorTmp = path.join(tmpdir(), `core-e2e-${e2eEnv["E2E_WEB_PORT"] ?? "web"}`);
  mkdirSync(emulatorTmp, { recursive: true });
  const emulatorEnv = { ...env, TMP: emulatorTmp, TEMP: emulatorTmp, TMPDIR: emulatorTmp };
  print(`running: ${command}`);
  const result = spawnSync(process.execPath, [firebaseBin, ...buildEmulatorExecArgs(command)], { cwd: APP_ROOT, env: emulatorEnv, stdio: "inherit", windowsHide: true });
  if (result.error !== undefined) throw result.error;
  return result.status ?? 1;
};

try {
  process.exitCode = await main();
} catch (error: unknown) {
  print(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
