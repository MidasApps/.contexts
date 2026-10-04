import { describe, expect, it } from "vitest";
import {
  buildComposeUpArgs,
  buildEmulatorEnv,
  buildEmulatorExportArgs,
  buildEmulatorStartArgs,
  buildFunctionsProbeUrl,
  buildKillTreeCommand,
  buildReadinessChecks,
  buildTurboDevArgs,
  describePortConflicts,
  readDevPorts,
} from "./dev-plan.ts";

describe("buildComposeUpArgs", () => {
  it("waits for healthy services and reads the workspace env file when present", () => {
    expect(buildComposeUpArgs({ envFile: ".env.local" })).toEqual([
      "compose",
      "--env-file",
      ".env.local",
      "up",
      "-d",
      "--wait",
    ]);
  });

  it("falls back to compose defaults without an env file", () => {
    expect(buildComposeUpArgs({})).toEqual(["compose", "up", "-d", "--wait"]);
  });
});

describe("buildEmulatorEnv", () => {
  it("gives the Functions emulator 180 s to load the functions and keeps the rest of the env", () => {
    expect(buildEmulatorEnv({ PATH: "/bin" })).toEqual({ PATH: "/bin", FUNCTIONS_DISCOVERY_TIMEOUT: "180" });
    expect(buildEmulatorEnv({ FUNCTIONS_DISCOVERY_TIMEOUT: "" })).toEqual({ FUNCTIONS_DISCOVERY_TIMEOUT: "180" });
  });

  it("keeps a timeout the shell already set", () => {
    expect(buildEmulatorEnv({ FUNCTIONS_DISCOVERY_TIMEOUT: "30" })).toEqual({ FUNCTIONS_DISCOVERY_TIMEOUT: "30" });
  });
});

describe("buildEmulatorStartArgs", () => {
  it("imports saved data only when the data folder exists and always exports on exit", () => {
    expect(buildEmulatorStartArgs({ projectId: "demo-core", dataDir: ".firebase-data", hasSavedData: true })).toEqual([
      "emulators:start",
      "--project",
      "demo-core",
      "--import",
      ".firebase-data",
      "--export-on-exit",
      ".firebase-data",
    ]);
    expect(buildEmulatorStartArgs({ projectId: "demo-core", dataDir: ".firebase-data", hasSavedData: false })).toEqual([
      "emulators:start",
      "--project",
      "demo-core",
      "--export-on-exit",
      ".firebase-data",
    ]);
  });

  it("refuses a project that is not a demo-* project", () => {
    expect(() =>
      buildEmulatorStartArgs({ projectId: "acme-prod", dataDir: ".firebase-data", hasSavedData: false }),
    ).toThrow(/demo-/);
  });
});

describe("buildEmulatorExportArgs", () => {
  it("exports the running emulators into the data folder", () => {
    expect(buildEmulatorExportArgs({ projectId: "demo-core", dataDir: ".firebase-data" })).toEqual([
      "emulators:export",
      ".firebase-data",
      "--project",
      "demo-core",
      "--force",
    ]);
  });
});

describe("buildTurboDevArgs", () => {
  it("runs web and mastra, but not desktop (the functions watcher starts before the emulators)", () => {
    const args = buildTurboDevArgs();
    expect(args).toEqual(["run", "dev", "--ui=stream", "--filter=@core/web", "--filter=@core/mastra"]);
    expect(args.join(" ")).not.toContain("desktop");
  });
});

describe("buildKillTreeCommand", () => {
  it("uses taskkill on Windows so grandchildren (next, java) die with the child", () => {
    expect(buildKillTreeCommand("win32", 4242)).toEqual({ command: "taskkill", args: ["/pid", "4242", "/T", "/F"] });
  });

  it("returns undefined elsewhere: the child leads its own process group", () => {
    expect(buildKillTreeCommand("linux", 4242)).toBeUndefined();
    expect(buildKillTreeCommand("darwin", 4242)).toBeUndefined();
  });
});

describe("buildReadinessChecks", () => {
  it("probes web on WEB_PORT and mastra on its PORT", () => {
    expect(buildReadinessChecks({ webPort: 3100, mastraPort: 4111 })).toEqual([
      { name: "web", url: "http://localhost:3100/v1/health" },
      { name: "mastra", url: "http://localhost:4111/health" },
    ]);
  });
});

describe("buildFunctionsProbeUrl", () => {
  it("points at the healthz function of the demo project in the emulator", () => {
    expect(buildFunctionsProbeUrl({ projectId: "demo-core", region: "southamerica-east1" })).toBe(
      "http://127.0.0.1:5001/demo-core/southamerica-east1/healthz",
    );
  });
});

describe("readDevPorts", () => {
  it("defaults web to 3000 and mastra to 4111", () => {
    expect(readDevPorts({})).toEqual({ webPort: 3000, mastraPort: 4111 });
  });

  it("reads WEB_PORT for web and PORT for mastra", () => {
    expect(readDevPorts({ WEB_PORT: "3100", PORT: "4200" })).toEqual({ webPort: 3100, mastraPort: 4200 });
  });

  it("rejects a port that is not an integer in range, naming the variable", () => {
    expect(() => readDevPorts({ WEB_PORT: "abc" })).toThrow(/WEB_PORT/);
    expect(() => readDevPorts({ PORT: "70000" })).toThrow(/PORT/);
  });
});

describe("describePortConflicts", () => {
  it("names each busy port and the variable that moves it", () => {
    expect(describePortConflicts([{ name: "web", port: 3000, variable: "WEB_PORT" }])).toBe(
      "port 3000 (web) is already in use; stop what holds it or set WEB_PORT to a free port",
    );
  });
});
