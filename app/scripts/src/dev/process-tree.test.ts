import { describe, expect, it } from "vitest";
import {
  collectDescendants,
  findSurvivors,
  mergeSnapshots,
  parsePsOutput,
  parseWindowsProcessJson,
} from "./process-tree.ts";

const T0 = "2026-09-29T19:00:00.000Z";
const T1 = "2026-09-29T19:00:05.000Z";

const TABLE = [
  { pid: 10, ppid: 1, name: "node.exe", startedAt: T0 }, // firebase CLI
  { pid: 11, ppid: 10, name: "cmd.exe", startedAt: T0 }, // shell that starts the Pub/Sub emulator
  { pid: 12, ppid: 11, name: "java.exe", startedAt: T0 },
  { pid: 13, ppid: 10, name: "java.exe", startedAt: T0 }, // Firestore
  { pid: 20, ppid: 1, name: "node.exe", startedAt: T0 }, // unrelated
];

describe("collectDescendants", () => {
  it("returns every process below the root, at any depth", () => {
    expect(
      collectDescendants(TABLE, 10)
        .map((entry) => entry.pid)
        .sort(),
    ).toEqual([11, 12, 13]);
  });

  it("returns nothing for a root without children", () => {
    expect(collectDescendants(TABLE, 20)).toEqual([]);
  });
});

describe("findSurvivors", () => {
  it("keeps only snapshot processes still running with the same pid, name and start time", () => {
    const snapshot = collectDescendants(TABLE, 10);
    const now = [
      { pid: 12, ppid: 4, name: "java.exe", startedAt: T0 }, // orphaned Pub/Sub emulator
      { pid: 13, ppid: 7, name: "chrome.exe", startedAt: T1 }, // pid reused by something else
    ];
    expect(findSurvivors(snapshot, now)).toEqual([{ pid: 12, ppid: 11, name: "java.exe", startedAt: T0 }]);
  });

  it("never kills a reused pid of an unrelated process with the same name", () => {
    const snapshot = [{ pid: 13, ppid: 10, name: "java.exe", startedAt: T0 }];
    const now = [{ pid: 13, ppid: 1, name: "java.exe", startedAt: T1 }];
    expect(findSurvivors(snapshot, now)).toEqual([]);
  });
});

describe("mergeSnapshots", () => {
  it("unions two snapshots once per process (pid + start time)", () => {
    const startup = [{ pid: 13, ppid: 10, name: "java.exe", startedAt: T0 }];
    const shutdown = [
      { pid: 13, ppid: 10, name: "java.exe", startedAt: T0 },
      { pid: 14, ppid: 11, name: "java.exe", startedAt: T1 }, // late Pub/Sub child
    ];
    expect(mergeSnapshots(startup, shutdown).map((entry) => entry.pid)).toEqual([13, 14]);
  });
});

describe("parsePsOutput", () => {
  it("reads pid, ppid, start time and command from `ps -A -o pid=,ppid=,lstart=,comm=`", () => {
    expect(
      parsePsOutput("   10     1 Tue Sep 29 19:00:00 2026 node\n   12    11 Tue Sep  1 07:05:09 2026 java\n\n"),
    ).toEqual([
      { pid: 10, ppid: 1, name: "node", startedAt: "Tue Sep 29 19:00:00 2026" },
      { pid: 12, ppid: 11, name: "java", startedAt: "Tue Sep  1 07:05:09 2026" },
    ]);
  });
});

describe("parseWindowsProcessJson", () => {
  it("reads the CIM process list, including a single-object result", () => {
    expect(
      parseWindowsProcessJson(`[{"ProcessId":10,"ParentProcessId":1,"Name":"node.exe","StartedAt":"${T0}"}]`),
    ).toEqual([{ pid: 10, ppid: 1, name: "node.exe", startedAt: T0 }]);
    expect(parseWindowsProcessJson(`{"ProcessId":12,"ParentProcessId":11,"Name":"java.exe","StartedAt":null}`)).toEqual(
      [{ pid: 12, ppid: 11, name: "java.exe", startedAt: "" }],
    );
  });
});
