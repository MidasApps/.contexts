import { describe, expect, it } from "vitest";
import { collectDescendants, findSurvivors, parsePsOutput, parseWindowsProcessJson } from "./process-tree.ts";

const TABLE = [
  { pid: 10, ppid: 1, name: "node.exe" }, // firebase CLI
  { pid: 11, ppid: 10, name: "cmd.exe" }, // shell that starts the Pub/Sub emulator
  { pid: 12, ppid: 11, name: "java.exe" },
  { pid: 13, ppid: 10, name: "java.exe" }, // Firestore
  { pid: 20, ppid: 1, name: "node.exe" }, // unrelated
];

describe("collectDescendants", () => {
  it("returns every process below the root, at any depth", () => {
    expect(collectDescendants(TABLE, 10).map((entry) => entry.pid).sort()).toEqual([11, 12, 13]);
  });

  it("returns nothing for a root without children", () => {
    expect(collectDescendants(TABLE, 20)).toEqual([]);
  });
});

describe("findSurvivors", () => {
  it("keeps only snapshot processes still running with the same pid and name", () => {
    const snapshot = collectDescendants(TABLE, 10);
    const now = [
      { pid: 12, ppid: 4, name: "java.exe" }, // orphaned Pub/Sub emulator
      { pid: 13, ppid: 7, name: "chrome.exe" }, // pid reused by something else
    ];
    expect(findSurvivors(snapshot, now)).toEqual([{ pid: 12, ppid: 11, name: "java.exe" }]);
  });
});

describe("parsePsOutput", () => {
  it("reads pid, ppid and command name from `ps -A -o pid=,ppid=,comm=`", () => {
    expect(parsePsOutput("  10     1 node\n  12    11 java\n\n")).toEqual([
      { pid: 10, ppid: 1, name: "node" },
      { pid: 12, ppid: 11, name: "java" },
    ]);
  });
});

describe("parseWindowsProcessJson", () => {
  it("reads the CIM process list, including a single-object result", () => {
    expect(parseWindowsProcessJson('[{"ProcessId":10,"ParentProcessId":1,"Name":"node.exe"}]')).toEqual([{ pid: 10, ppid: 1, name: "node.exe" }]);
    expect(parseWindowsProcessJson('{"ProcessId":12,"ParentProcessId":11,"Name":"java.exe"}')).toEqual([{ pid: 12, ppid: 11, name: "java.exe" }]);
  });
});
