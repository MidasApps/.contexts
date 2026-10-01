// `pnpm test:e2e` (root): the Playwright e2e run (SP2 spec §13) on its own stack. Starts the
// Auth and Firestore emulators of firebase.e2e.json (project demo-core-e2e, ports apart from
// `pnpm dev`), exports the e2e env (src/e2e/e2e-env.ts) and runs every package's `test:e2e`
// through turbo. The Playwright setup seeds the users; the web and desktop builds get the e2e
// public config. `pnpm test:e2e -- <command>` runs another command in the same stack instead,
// e.g. `pnpm test:e2e -- pnpm -F @core/web exec playwright test e2e/auth.spec.ts`.
// Ports: E2E_WEB_PORT (default 3100) and E2E_DESKTOP_PORT (default 1420); never 3000.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolvePackageBin } from "./src/dev/package-bin.ts";
import { buildE2eEnv, buildEmulatorExecArgs, DEFAULT_E2E_COMMAND, E2E_FIREBASE_CONFIG, joinCommandArgs } from "./src/e2e/e2e-env.ts";

const APP_ROOT = path.resolve(import.meta.dirname, "..");

const print = (line: string): void => {
  process.stdout.write(`[e2e] ${line}\n`);
};

const main = (): number => {
  const firebaseConfig: unknown = JSON.parse(readFileSync(path.join(APP_ROOT, E2E_FIREBASE_CONFIG), "utf8"));
  const e2eEnv = buildE2eEnv({ firebaseConfig, overrides: process.env });
  const extra = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === "--"));
  const command = extra.length > 0 ? joinCommandArgs(extra) : DEFAULT_E2E_COMMAND;
  const firebaseBin = resolvePackageBin({ fromDir: APP_ROOT, packageName: "firebase-tools", binName: "firebase" });
  print(`project ${e2eEnv["E2E_PROJECT_ID"] ?? ""}, web ${e2eEnv["E2E_WEB_ORIGIN"] ?? ""}, desktop ${e2eEnv["E2E_DESKTOP_ORIGIN"] ?? ""}`);
  print(`running: ${command}`);
  const result = spawnSync(process.execPath, [firebaseBin, ...buildEmulatorExecArgs(command)], {
    cwd: APP_ROOT,
    env: { ...process.env, ...e2eEnv },
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  return result.status ?? 1;
};

try {
  process.exitCode = main();
} catch (error: unknown) {
  print(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
