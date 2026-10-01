// Native desktop smoke inside the e2e stack (SP2 spec §13 item 8, decision 0017 §4). Run as
// `pnpm test:e2e -- node scripts/native-smoke.ts` after a web e2e build and a Tauri debug build
// with the e2e config (apps/desktop/README.md "Native smoke test"). Steps: seed the e2e world (web
// Playwright `setup` project), `next start` on E2E_WEB_PORT, `wdio run` in apps/desktop, then stop
// the web server this script started (and only it). Local only; never part of CI.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";

const APP_ROOT = path.resolve(import.meta.dirname, "..");
const WEB_DIR = path.join(APP_ROOT, "apps", "web");
const DESKTOP_DIR = path.join(APP_ROOT, "apps", "desktop");
const isWindows = process.platform === "win32";
const HEALTH_TIMEOUT_MS = 120_000;

const print = (line: string): void => {
  process.stdout.write(`[native-smoke] ${line}\n`);
};

const run = (command: string, args: readonly string[], cwd: string): number => {
  print(`${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: isWindows, windowsHide: true });
  return result.status ?? 1;
};

const waitForHealth = async (origin: string): Promise<void> => {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const healthy = await fetch(`${origin}/v1/health`).then((response) => response.ok, () => false);
    if (healthy) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`web did not answer ${origin}/v1/health`);
};

/** Stops the web server this script spawned, with its children (next start forks workers). */
const stopTree = (child: ChildProcess): void => {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (isWindows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else child.kill("SIGTERM");
};

// The driver processes the Tauri service spawns (tauri-driver, and msedgedriver on Windows).
const DRIVER_IMAGES = ["tauri-driver.exe", "msedgedriver.exe"] as const;

/** PIDs of the driver processes running now (Windows only; elsewhere the service stops them). */
const driverPids = (): Set<string> => {
  if (!isWindows) return new Set();
  const pids = DRIVER_IMAGES.flatMap((image) => {
    const listing = spawnSync("tasklist", ["/FI", `IMAGENAME eq ${image}`, "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true }).stdout;
    return listing.split(/\r?\n/).flatMap((line) => /^"[^"]+","(\d+)"/.exec(line)?.[1] ?? []);
  });
  return new Set(pids);
};

/**
 * On Windows @wdio/tauri-service 1.4.0 leaves tauri-driver and msedgedriver running after the
 * session: stop the ones that appeared during this run, never one that was already there.
 */
const stopNewDrivers = (before: ReadonlySet<string>): void => {
  for (const pid of driverPids()) {
    if (!before.has(pid)) spawnSync("taskkill", ["/pid", pid, "/T", "/F"], { stdio: "ignore", windowsHide: true });
  }
};

/** Runs the wdio smoke and stops the drivers it left behind. */
const runSmoke = (): number => {
  const before = driverPids();
  try {
    return run("pnpm", ["exec", "wdio", "run", "test-native/wdio.conf.ts"], DESKTOP_DIR);
  } finally {
    stopNewDrivers(before);
  }
};

const main = async (): Promise<number> => {
  const port = process.env["E2E_WEB_PORT"];
  const origin = process.env["E2E_WEB_ORIGIN"];
  if (port === undefined || origin === undefined) throw new Error("run through `pnpm test:e2e -- node scripts/native-smoke.ts`");
  const seeded = run("pnpm", ["exec", "playwright", "test", "--project", "setup"], WEB_DIR);
  if (seeded !== 0) return seeded;
  const web = spawn("pnpm", ["exec", "next", "start", "--port", port], { cwd: WEB_DIR, stdio: "ignore", shell: isWindows, windowsHide: true });
  try {
    await waitForHealth(origin);
    return runSmoke();
  } finally {
    stopTree(web);
  }
};

try {
  process.exitCode = await main();
} catch (error: unknown) {
  print(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
