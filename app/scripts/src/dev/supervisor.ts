import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { buildKillTreeCommand } from "./dev-plan.ts";

export type StartArgs = {
  name: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** When set, stdout is read line by line instead of inherited. */
  onStdoutLine?: (line: string) => void;
};

export type SupervisedChild = { name: string; pid: number };

export type StopArgs = {
  /** How long children may take to exit on their own before their trees are killed. */
  graceMs: number;
  /**
   * POSIX only: signal sent to each child's process group first. On Windows a
   * terminal Ctrl+C already reached every child sharing the console, and there
   * is no other graceful signal, so nothing is sent.
   */
  signal?: NodeJS.Signals;
};

export type Supervisor = {
  start: (args: StartArgs) => SupervisedChild;
  isRunning: (name: string) => boolean;
  stopAll: (args: StopArgs) => Promise<void>;
};

type Entry = { name: string; child: ChildProcess; exited: Promise<void>; hasExited: () => boolean };

const IS_WINDOWS = process.platform === "win32";

const killTree = (child: ChildProcess): void => {
  if (child.pid === undefined) return;
  const command = buildKillTreeCommand(process.platform, child.pid);
  if (command !== undefined) {
    spawnSync(command.command, command.args, { stdio: "ignore", windowsHide: true });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // The group is already gone.
  }
};

const signalGroup = (child: ChildProcess, signal: NodeJS.Signals): void => {
  if (IS_WINDOWS || child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // The group is already gone.
  }
};

const delay = (ms: number): Promise<"timeout"> => new Promise((resolve) => setTimeout(() => resolve("timeout"), ms));

/**
 * Starts long-running dev processes and stops them without orphans: each child
 * gets a grace period, then its whole tree is killed. On POSIX every child leads
 * its own process group (`detached`), so a group signal reaches its descendants;
 * on Windows `detached` would open a new console, so trees are killed with taskkill.
 */
export const createSupervisor = (options: {
  log: (line: string) => void;
  /** Called when a child exits while no stop is in progress. */
  onUnexpectedExit?: (name: string, code: number | null) => void;
}): Supervisor => {
  const entries: Entry[] = [];
  let stopping = false;

  const start = (args: StartArgs): SupervisedChild => {
    // A child started after stopAll would never be stopped.
    if (stopping) throw new Error(`supervisor is stopping; not starting ${args.name}`);
    const child = spawn(args.command, args.args, {
      cwd: args.cwd,
      env: args.env ?? process.env,
      stdio: ["ignore", args.onStdoutLine === undefined ? "inherit" : "pipe", "inherit"],
      detached: !IS_WINDOWS,
      windowsHide: true,
    });
    if (child.pid === undefined) throw new Error(`could not start ${args.name} (${args.command})`);
    const onLine = args.onStdoutLine;
    if (onLine !== undefined && child.stdout !== null) createInterface({ input: child.stdout }).on("line", onLine);
    let exited = false;
    const exitedPromise = new Promise<void>((resolve) => {
      child.on("exit", (code) => {
        exited = true;
        if (!stopping) options.onUnexpectedExit?.(args.name, code);
        resolve();
      });
    });
    entries.push({ name: args.name, child, exited: exitedPromise, hasExited: () => exited });
    return { name: args.name, pid: child.pid };
  };

  const isRunning = (name: string): boolean => entries.some((entry) => entry.name === name && !entry.hasExited());

  const stopAll = async ({ graceMs, signal }: StopArgs): Promise<void> => {
    stopping = true;
    const running = entries.filter((entry) => !entry.hasExited());
    if (signal !== undefined) for (const entry of running) signalGroup(entry.child, signal);
    const allExited = Promise.all(running.map((entry) => entry.exited)).then(() => "exited" as const);
    if (graceMs > 0 && (await Promise.race([allExited, delay(graceMs)])) === "exited") return;
    for (const entry of running.filter((candidate) => !candidate.hasExited())) {
      options.log(`stopping ${entry.name} (pid ${String(entry.child.pid)}) and its child processes`);
      killTree(entry.child);
    }
    await Promise.race([allExited, delay(5_000)]);
  };

  return { start, isRunning, stopAll };
};
