// `pnpm seed:local` (root): idempotent local seed. Refuses to run unless it
// targets the Auth Emulator of a demo-* project (src/seed/seed-target.ts).
// Needs the emulators running (`pnpm dev`).
import { existsSync } from "node:fs";
import path from "node:path";
import { createAuthEmulatorAdmin } from "./src/seed/auth-emulator-admin.ts";
import { LOCAL_SEED_STEPS } from "./src/seed/seed-steps.ts";
import { resolveSeedTarget } from "./src/seed/seed-target.ts";

const ENV_FILE = path.resolve(import.meta.dirname, "../.env.local");

const print = (line: string): void => {
  process.stdout.write(`[seed:local] ${line}\n`);
};

const main = async (): Promise<void> => {
  // Never overrides a variable already set in the shell.
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const target = resolveSeedTarget(process.env);
  const auth = createAuthEmulatorAdmin({ origin: target.authEmulatorOrigin, projectId: target.projectId });
  print(`project ${target.projectId}, auth emulator ${target.authEmulatorOrigin}`);
  for (const step of LOCAL_SEED_STEPS) {
    print(`${step.name}: ${await step.run({ target, auth, processEnv: process.env })}`);
  }
};

try {
  await main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  // fetch rejects with a TypeError when nothing listens on the emulator port.
  const hint = error instanceof TypeError ? " (is the Auth Emulator running? start it with `pnpm dev`)" : "";
  print(`failed: ${message}${hint}`);
  process.exitCode = 1;
}
