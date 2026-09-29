import { describe, expect, it, vi } from "vitest";
import { configureProcessLogger, readProcessLogContext } from "./process-logger.ts";

describe("configureProcessLogger", () => {
  it("replaces the unconfigured context with the boot-time service and env", () => {
    expect(readProcessLogContext()).toEqual({ service: "unknown", env: "unknown" });

    configureProcessLogger({ service: "web", env: "local" });

    expect(readProcessLogContext()).toEqual({ service: "web", env: "local" });
  });

  it("shares the context with a separately loaded module instance", async () => {
    configureProcessLogger({ service: "web", env: "staging" });
    vi.resetModules();

    const fresh = await import("./process-logger.ts");

    expect(fresh.readProcessLogContext()).toEqual({ service: "web", env: "staging" });
  });
});
