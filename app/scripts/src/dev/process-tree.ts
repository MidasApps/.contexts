import { spawnSync } from "node:child_process";
import { z } from "zod";

export type ProcessEntry = { pid: number; ppid: number; name: string };

/** Every process below `rootPid`, at any depth, from one snapshot of the process table. */
export const collectDescendants = (entries: readonly ProcessEntry[], rootPid: number): ProcessEntry[] => {
  const found: ProcessEntry[] = [];
  const queue = [rootPid];
  const seen = new Set<number>([rootPid]);
  while (queue.length > 0) {
    const parent = queue.shift();
    for (const entry of entries.filter((candidate) => candidate.ppid === parent && !seen.has(candidate.pid))) {
      seen.add(entry.pid);
      found.push(entry);
      queue.push(entry.pid);
    }
  }
  return found;
};

/** Snapshot processes still running; pid and name must both match, so a reused pid is left alone. */
export const findSurvivors = (snapshot: readonly ProcessEntry[], current: readonly ProcessEntry[]): ProcessEntry[] =>
  snapshot.filter((entry) => current.some((live) => live.pid === entry.pid && live.name === entry.name));

/** Parses `ps -A -o pid=,ppid=,comm=`. */
export const parsePsOutput = (output: string): ProcessEntry[] =>
  output.split("\n").flatMap((line): ProcessEntry[] => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    return match === null ? [] : [{ pid: Number(match[1]), ppid: Number(match[2]), name: match[3] ?? "" }];
  });

const CimProcessSchema = z.object({ ProcessId: z.number(), ParentProcessId: z.number(), Name: z.string() });

/** Parses `Get-CimInstance Win32_Process | ConvertTo-Json` (one process serializes as an object). */
export const parseWindowsProcessJson = (json: string): ProcessEntry[] => {
  const parsed = z.union([z.array(CimProcessSchema), CimProcessSchema]).parse(JSON.parse(json));
  return (Array.isArray(parsed) ? parsed : [parsed]).map((entry) => ({ pid: entry.ProcessId, ppid: entry.ParentProcessId, name: entry.Name }));
};

const WINDOWS_LIST_COMMAND =
  "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress";

/** Current process table; empty when it cannot be read (cleanup is best effort). */
export const listProcesses = (): ProcessEntry[] => {
  const result =
    process.platform === "win32"
      ? spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_LIST_COMMAND], { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
      : spawnSync("ps", ["-A", "-o", "pid=,ppid=,comm="], { encoding: "utf8" });
  if (result.status !== 0) return [];
  try {
    return process.platform === "win32" ? parseWindowsProcessJson(result.stdout) : parsePsOutput(result.stdout);
  } catch {
    return [];
  }
};

/**
 * Kills snapshot processes that outlived their parent. firebase-tools starts the
 * Pub/Sub emulator through a shell and, on Windows, stopping it ends the shell
 * but leaves its java process holding port 8085; that orphan has no parent left
 * for a tree kill to find.
 *
 * @returns the processes that were killed.
 */
export const killSurvivors = (snapshot: readonly ProcessEntry[]): ProcessEntry[] => {
  if (snapshot.length === 0) return [];
  const survivors = findSurvivors(snapshot, listProcesses());
  for (const entry of survivors) {
    try {
      process.kill(entry.pid, "SIGKILL");
    } catch {
      // Exited between the listing and the kill.
    }
  }
  return survivors;
};
