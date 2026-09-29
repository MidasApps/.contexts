// `pnpm dev` (root): brings up the local stack for this workspace. See
// src/dev/dev-session.ts for the order and the shutdown guarantees.
import { existsSync } from "node:fs";
import path from "node:path";
import { log, runDevSession } from "./src/dev/dev-session.ts";

const APP_ROOT = path.resolve(import.meta.dirname, "..");
const ENV_FILE = ".env.local";

const main = async (): Promise<number> => {
  const envPath = path.join(APP_ROOT, ENV_FILE);
  if (!existsSync(envPath)) {
    log(`missing ${ENV_FILE}: run \`cp .env.example .env.local\` in app/ first`);
    return 1;
  }
  // Never overrides a variable already set in the shell (e.g. WEB_PORT=3100 pnpm dev).
  process.loadEnvFile(envPath);
  return runDevSession({
    appRoot: APP_ROOT,
    envFile: ENV_FILE,
    projectId: process.env["FIREBASE_PROJECT_ID"] ?? "demo-core",
    dataDir: ".firebase-data",
    emulatorUiUrl: "http://127.0.0.1:4000/",
    // Keep in sync with FUNCTIONS_REGION in apps/functions/src/functions-options.ts.
    functionsRegion: "southamerica-east1",
  });
};

try {
  process.exitCode = await main();
} catch (error: unknown) {
  log(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
// Children are gone by now; exit even if a stray handle (stdin, timers) remains.
process.exit();
