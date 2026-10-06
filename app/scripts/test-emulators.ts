// `pnpm test:emulators` (root): every package's `*.emulator.test.ts` against one Emulator Suite.
// Builds the Functions source the emulator loads, then runs `turbo run test:emulators` inside
// `firebase emulators:exec`, one package at a time (`--concurrency=1`): the packages share the
// emulators (and mastra's suites the compose database), and parallel packages raced on that state
// and timed out under load. Each package's `emulators` project also runs its files serially
// (EMULATOR_PROJECT_DEFAULTS in @core/config/vitest).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { resolvePackageBin } from "./src/dev/package-bin.ts";

const APP_ROOT = path.resolve(import.meta.dirname, "..");
/**
 * Loading `apps/functions/lib` takes longer than the emulator's 10 s default on a busy machine
 * ("Cannot determine backend specification. Timeout after 10000"); the trigger tests then fail.
 */
const FUNCTIONS_DISCOVERY_TIMEOUT_SECONDS = "180";
const EMULATORS = "auth,firestore,functions,storage";

const print = (line: string): void => {
  process.stdout.write(`[test:emulators] ${line}\n`);
};

const run = (bin: string, args: readonly string[], env: NodeJS.ProcessEnv): number => {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: APP_ROOT,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  return result.status ?? 1;
};

const main = (): number => {
  const env = {
    ...process.env,
    FUNCTIONS_DISCOVERY_TIMEOUT: process.env["FUNCTIONS_DISCOVERY_TIMEOUT"] ?? FUNCTIONS_DISCOVERY_TIMEOUT_SECONDS,
  };
  const turbo = resolvePackageBin({ fromDir: APP_ROOT, packageName: "turbo", binName: "turbo" });
  const firebase = resolvePackageBin({ fromDir: APP_ROOT, packageName: "firebase-tools", binName: "firebase" });
  print("building the functions source");
  const built = run(turbo, ["run", "build", "--filter=@core/functions"], env);
  if (built !== 0) return built;
  print(`running the emulator suites (${EMULATORS}), one package at a time`);
  return run(
    firebase,
    ["emulators:exec", "--project", "demo-core", "--only", EMULATORS, "turbo run test:emulators --concurrency=1"],
    env,
  );
};

try {
  process.exitCode = main();
} catch (error: unknown) {
  print(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
