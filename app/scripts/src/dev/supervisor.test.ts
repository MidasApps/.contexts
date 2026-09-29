import { afterEach, describe, expect, it } from "vitest";
import { createSupervisor, type Supervisor } from "./supervisor.ts";

// A child that spawns a grandchild and prints its pid, like turbo → next.
const PARENT_WITH_GRANDCHILD = `
const { spawn } = require("node:child_process");
const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
console.log(grandchild.pid);
setInterval(() => {}, 1000);
`;

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const waitUntil = async (predicate: () => boolean, timeoutMs: number): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return predicate();
};

let supervisor: Supervisor | undefined;

afterEach(async () => {
  await supervisor?.stopAll({ graceMs: 0 });
  supervisor = undefined;
});

describe("createSupervisor", () => {
  it("kills each child together with its grandchildren", async () => {
    supervisor = createSupervisor({ log: () => undefined });
    const lines: string[] = [];
    const child = supervisor.start({ name: "parent", command: process.execPath, args: ["-e", PARENT_WITH_GRANDCHILD], onStdoutLine: (line) => lines.push(line) });
    expect(await waitUntil(() => lines.length > 0, 5_000)).toBe(true);
    const grandchildPid = Number(lines[0]);

    await supervisor.stopAll({ graceMs: 0 });

    expect(await waitUntil(() => !isAlive(child.pid) && !isAlive(grandchildPid), 5_000)).toBe(true);
  });

  it("waits for children that exit on their own within the grace period", async () => {
    supervisor = createSupervisor({ log: () => undefined });
    const child = supervisor.start({ name: "short", command: process.execPath, args: ["-e", "setTimeout(() => {}, 200)"] });
    const startedAt = Date.now();
    await supervisor.stopAll({ graceMs: 5_000, signal: "SIGINT" });
    expect(isAlive(child.pid)).toBe(false);
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });

  it("reports a child that exits while the others keep running", async () => {
    const exits: string[] = [];
    supervisor = createSupervisor({ log: () => undefined, onUnexpectedExit: (name) => exits.push(name) });
    supervisor.start({ name: "crashes", command: process.execPath, args: ["-e", "process.exit(3)"] });
    expect(await waitUntil(() => exits.length > 0, 5_000)).toBe(true);
    expect(exits).toEqual(["crashes"]);
  });

  it("does not report exits caused by stopAll", async () => {
    const exits: string[] = [];
    supervisor = createSupervisor({ log: () => undefined, onUnexpectedExit: (name) => exits.push(name) });
    supervisor.start({ name: "long", command: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"] });
    await supervisor.stopAll({ graceMs: 0 });
    expect(exits).toEqual([]);
  });
});

