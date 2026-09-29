import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  buildComposeUpArgs,
  buildEmulatorExportArgs,
  buildEmulatorStartArgs,
  buildFunctionsProbeUrl,
  buildReadinessChecks,
  buildTurboDevArgs,
  readDevPorts,
} from "./dev-plan.ts";
import { resolvePackageBin } from "./package-bin.ts";
import { collectDescendants, killSurvivors, listProcesses, type ProcessEntry } from "./process-tree.ts";
import { createSupervisor, type Supervisor } from "./supervisor.ts";
import { fetchHttpStatus, waitForHttp } from "./wait-for-http.ts";

export type DevSessionConfig = {
  /** Workspace root (`app/`). */
  appRoot: string;
  envFile: string;
  projectId: string;
  dataDir: string;
  emulatorUiUrl: string;
  /** apps/functions/src/functions-options.ts `FUNCTIONS_REGION`. */
  functionsRegion: string;
};

const STARTUP_TIMEOUT_MS = 180_000;
/** Firebase exports emulator data on Ctrl+C before it exits; give it time. */
const SHUTDOWN_GRACE_MS = 30_000;
const EXPORT_TIMEOUT_MS = 60_000;
const IS_WINDOWS = process.platform === "win32";

export const log = (line: string): void => {
  process.stdout.write(`[dev] ${line}\n`);
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs a setup command to completion with inherited output; a non-zero exit is fatal. */
const runStep = (label: string, command: string, args: string[], cwd: string): void => {
  log(label);
  const result = spawnSync(command, args, { cwd, stdio: "inherit", windowsHide: true });
  if (result.error !== undefined) throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${String(result.status)}`);
};

const waitUntilReady = async (name: string, url: string, signal: AbortSignal): Promise<boolean> => {
  const result = await waitForHttp({
    url, timeoutMs: STARTUP_TIMEOUT_MS, intervalMs: 1_000, fetchStatus: fetchHttpStatus, now: () => Date.now(), sleep, signal,
  });
  if (!signal.aborted) log(result.ready ? `${name} ready: ${url}` : `${name} not ready after ${String(STARTUP_TIMEOUT_MS / 1000)}s: ${url}`);
  return result.ready;
};

type Stopper = { stop: (reason: string, code: number, interactive?: boolean) => Promise<void>; stopped: Promise<number>; signal: AbortSignal };

/**
 * One shutdown path for Ctrl+C, other signals and crashed children. A console
 * Ctrl+C already reached every child (Windows console / POSIX group signal
 * below), so they get a grace period to exit and export emulator data. Any other
 * stop on Windows cannot signal gracefully: it exports explicitly, then kills.
 */
const createStopper = (supervisor: Supervisor, exportEmulatorData: () => void, emulatorTree: () => readonly ProcessEntry[]): Stopper => {
  const controller = new AbortController();
  let resolveStopped: (code: number) => void = () => undefined;
  const stopped = new Promise<number>((resolve) => { resolveStopped = resolve; });
  let stopping = false;
  const stop = async (reason: string, code: number, interactive = false): Promise<void> => {
    if (stopping) {
      log("stopping now");
      await supervisor.stopAll({ graceMs: 0 });
      return;
    }
    stopping = true;
    controller.abort();
    log(`stopping (${reason}); press Ctrl+C again to force`);
    const graceful = interactive || !IS_WINDOWS;
    if (!graceful) exportEmulatorData();
    await supervisor.stopAll({ graceMs: graceful ? SHUTDOWN_GRACE_MS : 0, signal: "SIGINT" });
    for (const orphan of killSurvivors(emulatorTree())) log(`killed orphaned emulator process ${orphan.name} (pid ${String(orphan.pid)})`);
    log("all dev processes stopped");
    resolveStopped(code);
  };
  return { stop, stopped, signal: controller.signal };
};

type Bins = { firebase: string; turbo: string };

const startLongRunning = async (supervisor: Supervisor, stopper: Stopper, config: DevSessionConfig, bins: Bins, onEmulatorsUp: (pid: number) => void): Promise<void> => {
  const hasSavedData = existsSync(path.join(config.appRoot, config.dataDir));
  supervisor.start({ name: "functions-watch", command: process.execPath, args: [path.join("apps", "functions", "build.ts"), "--watch"], cwd: config.appRoot });
  const emulators = supervisor.start({ name: "emulators", command: process.execPath, args: [bins.firebase, ...buildEmulatorStartArgs({ ...config, hasSavedData })], cwd: config.appRoot });
  if (!(await waitUntilReady("emulator ui", config.emulatorUiUrl, stopper.signal))) {
    await stopper.stop("emulators did not start", 1);
    return;
  }
  // A load failure is fixable by editing code (the watcher rebuilds), so it only warns.
  await waitUntilReady("functions", buildFunctionsProbeUrl({ projectId: config.projectId, region: config.functionsRegion }), stopper.signal);
  if (stopper.signal.aborted) return;
  onEmulatorsUp(emulators.pid);
  supervisor.start({ name: "turbo", command: process.execPath, args: [bins.turbo, ...buildTurboDevArgs()], cwd: config.appRoot });
  const checks = buildReadinessChecks(readDevPorts(process.env));
  await Promise.all(checks.map((check) => waitUntilReady(check.name, check.url, stopper.signal)));
  if (!stopper.signal.aborted) log("everything is up; Ctrl+C stops it (desktop: `pnpm dev:desktop` in another terminal)");
};

/**
 * `pnpm dev`: Postgres (compose, healthy) → Functions build → Functions watch +
 * Emulator Suite → turbo dev (web, Mastra). Ctrl+C stops everything: children get
 * a grace period (the emulators export their data), then any survivor's process
 * tree is killed, so nothing keeps holding a port. Postgres stays up (compose
 * service; `docker compose stop` stops it).
 *
 * @returns the process exit code.
 */
export const runDevSession = async (config: DevSessionConfig): Promise<number> => {
  readDevPorts(process.env); // fail before starting anything on an invalid port
  const bins = {
    firebase: resolvePackageBin({ fromDir: config.appRoot, packageName: "firebase-tools", binName: "firebase" }),
    turbo: resolvePackageBin({ fromDir: config.appRoot, packageName: "turbo", binName: "turbo" }),
  };
  runStep("postgres: docker compose up --wait", "docker", buildComposeUpArgs({ envFile: config.envFile }), config.appRoot);
  runStep("functions: initial build", process.execPath, [path.join("apps", "functions", "build.ts")], config.appRoot);

  // The supervisor reports crashes to the stopper, which needs the supervisor.
  const stopperRef: { current?: Stopper } = {};
  const supervisor = createSupervisor({
    log,
    onUnexpectedExit: (name, code) => void stopperRef.current?.stop(`${name} exited with code ${String(code)}`, 1),
  });
  // Emulator processes seen once everything is up; checked again after the stop.
  let emulatorTree: readonly ProcessEntry[] = [];
  const active = createStopper(supervisor, () => {
    if (!supervisor.isRunning("emulators")) return;
    log("emulators: exporting data before stopping");
    spawnSync(process.execPath, [bins.firebase, ...buildEmulatorExportArgs(config)], {
      cwd: config.appRoot, stdio: "inherit", timeout: EXPORT_TIMEOUT_MS, windowsHide: true,
    });
  }, () => emulatorTree);
  stopperRef.current = active;
  process.on("SIGINT", () => void active.stop("Ctrl+C", 0, true));
  for (const signal of ["SIGTERM", "SIGHUP", "SIGBREAK"] as const) process.on(signal, () => void active.stop(signal, 0));

  await startLongRunning(supervisor, active, config, bins, (pid) => {
    emulatorTree = collectDescendants(listProcesses(), pid);
  });
  return active.stopped;
};
