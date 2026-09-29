import { spawnSync } from "node:child_process";
import { z } from "zod";

/**
 * One row of the process table. `startedAt` is the creation time as the OS
 * reports it (ISO on Windows, `ps` lstart on POSIX); with pid and name it
 * identifies a process, so a reused pid is never mistaken for the original.
 * Empty when unknown.
 */
export type ProcessEntry = { pid: number; ppid: number; name: string; startedAt: string };

const sameProcess = (left: ProcessEntry, right: ProcessEntry): boolean =>
  left.pid === right.pid && left.name === right.name && left.startedAt === right.startedAt;

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

/**
 * Snapshot processes still running: pid, name and start time must all match, so
 * a reused pid (even of a same-name process) is left alone. A process whose start
 * time is unknown is never reported.
 */
export const findSurvivors = (snapshot: readonly ProcessEntry[], current: readonly ProcessEntry[]): ProcessEntry[] =>
  snapshot.filter((entry) => entry.startedAt !== "" && current.some((live) => sameProcess(live, entry)));

/** Union of two snapshots, each process once. */
export const mergeSnapshots = (first: readonly ProcessEntry[], second: readonly ProcessEntry[]): ProcessEntry[] => [
  ...first,
  ...second.filter((entry) => !first.some((known) => sameProcess(known, entry))),
];

// lstart is fixed-width: "Tue Sep 29 19:00:00 2026" (day of month space-padded).
const PS_LINE = /^\s*(\d+)\s+(\d+)\s+(\w{3} \w{3} [ \d]\d \d\d:\d\d:\d\d \d{4})\s+(.+?)\s*$/;

/** Parses `ps -A -o pid=,ppid=,lstart=,comm=` (run with LC_ALL=C). */
export const parsePsOutput = (output: string): ProcessEntry[] =>
  output.split("\n").flatMap((line): ProcessEntry[] => {
    const match = PS_LINE.exec(line);
    return match === null ? [] : [{ pid: Number(match[1]), ppid: Number(match[2]), name: match[4] ?? "", startedAt: match[3] ?? "" }];
  });

const CimProcessSchema = z.object({
  ProcessId: z.number(),
  ParentProcessId: z.number(),
  Name: z.string(),
  StartedAt: z.string().nullable(),
});

/** Parses the Windows listing below (one process serializes as an object, not an array). */
export const parseWindowsProcessJson = (json: string): ProcessEntry[] => {
  const parsed = z.union([z.array(CimProcessSchema), CimProcessSchema]).parse(JSON.parse(json));
  return (Array.isArray(parsed) ? parsed : [parsed]).map((entry) => ({
    pid: entry.ProcessId,
    ppid: entry.ParentProcessId,
    name: entry.Name,
    startedAt: entry.StartedAt ?? "",
  }));
};

const WINDOWS_LIST_COMMAND =
  "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name," +
  "@{n='StartedAt';e={if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { $null }}}" +
  " | ConvertTo-Json -Compress";

/** Current process table; empty when it cannot be read (cleanup is best effort). */
export const listProcesses = (): ProcessEntry[] => {
  const result =
    process.platform === "win32"
      ? spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_LIST_COMMAND], {
          encoding: "utf8",
          windowsHide: true,
          maxBuffer: 16 * 1024 * 1024,
        })
      : spawnSync("ps", ["-A", "-o", "pid=,ppid=,lstart=,comm="], { encoding: "utf8", env: { ...process.env, LC_ALL: "C" } });
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
