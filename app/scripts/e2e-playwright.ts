// Default command of `pnpm test:e2e` inside the e2e emulators (scripts/e2e.ts): builds what the
// journeys need, then runs Playwright in the web app and in the desktop app, one after the other,
// each started directly instead of through `turbo run test:e2e` (follow-up 87). Every app runs
// even when an earlier one failed; the exit code is the first failure's.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { resolvePackageBin } from "./src/dev/package-bin.ts";
import { buildE2eSteps } from "./src/e2e/e2e-steps.ts";

const APP_ROOT = path.resolve(import.meta.dirname, "..");

const print = (line: string): void => {
  process.stdout.write(`[e2e] ${line}\n`);
};

const main = (): number => {
  let exitCode = 0;
  for (const step of buildE2eSteps({ appRoot: APP_ROOT, resolveBin: resolvePackageBin })) {
    print(`${step.label}: ${step.args.slice(1).join(" ")}`);
    const result = spawnSync(process.execPath, [...step.args], {
      cwd: step.cwd,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error !== undefined) throw result.error;
    const status = result.status ?? 1;
    if (step.label === "build" && status !== 0) return status;
    if (exitCode === 0) exitCode = status;
  }
  return exitCode;
};

try {
  process.exitCode = main();
} catch (error: unknown) {
  print(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
