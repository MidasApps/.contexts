/**
 * Pure argument builders for `pnpm dev` (scripts/dev.ts). Keeping them free of
 * I/O lets the orchestration order and the safety checks be unit-tested.
 */
import { z } from "zod";

/** `demo-*` project ids can never reach a real Firebase project (environments.md §9). */
const DEMO_PROJECT_PREFIX = "demo-";

/** `docker compose up -d --wait`: returns once every service healthcheck passes. */
export const buildComposeUpArgs = (args: { envFile?: string }): string[] => [
  "compose",
  ...(args.envFile === undefined ? [] : ["--env-file", args.envFile]),
  "up",
  "-d",
  "--wait",
];

/**
 * `firebase emulators:start` against the demo project. `--import` only when the
 * folder exists (the CLI fails on a missing import folder); `--export-on-exit`
 * saves the data when the emulators stop through Ctrl+C.
 *
 * @throws {Error} when the project is not a `demo-*` project.
 */
export const buildEmulatorStartArgs = (args: {
  projectId: string;
  dataDir: string;
  hasSavedData: boolean;
}): string[] => {
  if (!args.projectId.startsWith(DEMO_PROJECT_PREFIX)) {
    throw new Error(`local emulators only run a ${DEMO_PROJECT_PREFIX}* project (FIREBASE_PROJECT_ID)`);
  }
  return [
    "emulators:start",
    "--project",
    args.projectId,
    ...(args.hasSavedData ? ["--import", args.dataDir] : []),
    "--export-on-exit",
    args.dataDir,
  ];
};

/**
 * Seconds the Functions emulator may take to load `lib/` and answer its discovery request
 * (firebase-tools `FUNCTIONS_DISCOVERY_TIMEOUT`). The CLI's default is 10 s; on a loaded machine
 * the load takes longer, the emulator gives up ("Cannot determine backend specification.
 * Timeout after 10000") and no function is served for the session (uploads stay `pending`).
 */
export const FUNCTIONS_DISCOVERY_TIMEOUT_SECONDS = 180;

/** Env of the emulator process: the shell's, plus the discovery timeout unless the shell set one. */
export const buildEmulatorEnv = (
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> => {
  const fromShell = env["FUNCTIONS_DISCOVERY_TIMEOUT"];
  const timeout = fromShell === undefined || fromShell === "" ? String(FUNCTIONS_DISCOVERY_TIMEOUT_SECONDS) : fromShell;
  return { ...env, FUNCTIONS_DISCOVERY_TIMEOUT: timeout };
};

/** Explicit export, used when the emulators are stopped by something other than Ctrl+C. */
export const buildEmulatorExportArgs = (args: { projectId: string; dataDir: string }): string[] => [
  "emulators:export",
  args.dataDir,
  "--project",
  args.projectId,
  "--force",
];

/**
 * Long-running dev servers under one turbo process: web (`next dev` on WEB_PORT)
 * and Mastra (`mastra dev`, Studio on 4111). The Functions watcher is not here:
 * it starts before the emulators so they load a fresh `lib/`. Desktop stays
 * opt-in (`pnpm dev:desktop`): Rust builds take minutes. `--ui=stream` keeps
 * plain prefixed logs and lets Ctrl+C reach every task.
 */
export const buildTurboDevArgs = (): string[] => [
  "run",
  "dev",
  "--ui=stream",
  "--filter=@core/web",
  "--filter=@core/mastra",
];

const EmulatorPortSchema = z.object({ port: z.number().int().min(1).max(65_535) });

/** The emulators of `firebase.json` that `pnpm dev` probes; the file is the single source of their ports. */
const FirebaseDevConfigSchema = z.object({
  emulators: z.object({ ui: EmulatorPortSchema, functions: EmulatorPortSchema }),
});

/**
 * Ports of the Emulator UI and the Functions emulator in `firebase.json`, so the readiness probes
 * reach the emulators this workspace started, whatever ports the file gives them.
 *
 * @throws {Error} naming `firebase.json` and each entry that is missing or is not a port.
 */
export const readEmulatorPorts = (firebaseConfig: unknown): { ui: number; functions: number } => {
  const parsed = FirebaseDevConfigSchema.safeParse(firebaseConfig);
  if (!parsed.success) {
    const entries = [...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".")))];
    throw new Error(`invalid firebase.json: expected a port between 1 and 65535 at ${entries.join(", ")}`);
  }
  return { ui: parsed.data.emulators.ui.port, functions: parsed.data.emulators.functions.port };
};

/**
 * `readEmulatorPorts` from the text of `firebase.json`, so a file that is not JSON stops `pnpm dev`
 * with the same message form as a missing port, not with the parser's own error.
 *
 * @throws {Error} naming `firebase.json` when the text is not JSON, or when a port is missing or is not a port.
 */
export const parseEmulatorPorts = (firebaseJson: string): { ui: number; functions: number } => {
  let firebaseConfig: unknown;
  try {
    firebaseConfig = JSON.parse(firebaseJson);
  } catch {
    throw new Error("invalid firebase.json: the file is not valid JSON");
  }
  return readEmulatorPorts(firebaseConfig);
};

/** The Emulator UI answers once the emulators are up: the first readiness probe of `pnpm dev`. */
export const buildEmulatorUiUrl = (port: number): string => `http://127.0.0.1:${String(port)}/`;

/**
 * The Functions emulator's `healthz` (apps/functions, decision 0003). It answers
 * only after the emulator has loaded `lib/`, so it is the signal to start the
 * CPU-heavy dev servers: loading under load can hit the emulator's 10 s timeout.
 */
export const buildFunctionsProbeUrl = (args: { projectId: string; region: string; port: number }): string =>
  `http://127.0.0.1:${String(args.port)}/${args.projectId}/${args.region}/healthz`;

export type KillTreeCommand = { command: string; args: string[] };

/**
 * Windows has no process groups a parent can signal: `taskkill /T` walks the
 * tree (turbo → next, firebase → java). Elsewhere each child leads its own
 * process group and is signalled with `process.kill(-pid)`, so no command.
 */
export const buildKillTreeCommand = (platform: NodeJS.Platform, pid: number): KillTreeCommand | undefined =>
  platform === "win32" ? { command: "taskkill", args: ["/pid", String(pid), "/T", "/F"] } : undefined;

export type ReadinessCheck = { name: string; url: string };

/** Health endpoints polled after start: web `/v1/health` (decision 0003) and Mastra `/health`. */
export const buildReadinessChecks = (args: { webPort: number; mastraPort: number }): ReadinessCheck[] => [
  { name: "web", url: `http://localhost:${args.webPort}/v1/health` },
  { name: "mastra", url: `http://localhost:${args.mastraPort}/health` },
];

// Same rule as apps/web/scripts/web-port.ts (resolveWebPort), kept twice on purpose:
// sharing it needs a package both import, and the only candidates (@core/services,
// @core/contracts) are runtime code that a dev-tooling helper does not belong in.
const parsePort = (name: string, raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw === "") return fallback;
  const port = /^\d{1,5}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`invalid environment: ${name} must be an integer between 1 and 65535`);
  }
  return port;
};

/**
 * Ports the readiness checks probe. The defaults mirror the servers' own:
 * apps/web/scripts/web-port.ts (WEB_PORT, 3000) and Mastra (PORT, 4111).
 *
 * @throws {Error} naming the variable when a port is not an integer in 1–65535.
 */
export const readDevPorts = (
  env: Readonly<Record<string, string | undefined>>,
): { webPort: number; mastraPort: number } => ({
  webPort: parsePort("WEB_PORT", env["WEB_PORT"], 3000),
  mastraPort: parsePort("PORT", env["PORT"], 4111),
});

/**
 * One line per busy port, naming the variable that moves it. `pnpm dev` stops on
 * this before starting anything: a stranger on the port would otherwise answer
 * the readiness probe and look like our server.
 */
export const describePortConflicts = (busy: readonly { name: string; port: number; variable: string }[]): string =>
  busy
    .map(
      (check) =>
        `port ${String(check.port)} (${check.name}) is already in use; stop what holds it or set ${check.variable} to a free port`,
    )
    .join("\n");
