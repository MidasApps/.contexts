import { describe, expect, it } from "vitest";
import { configureProcessLogger, readProcessLogContext } from "./process-logger.ts";

describe("configureProcessLogger", () => {
  it("replaces the unconfigured context with the boot-time service and env", () => {
    expect(readProcessLogContext()).toEqual({ service: "unknown", env: "unknown" });

    configureProcessLogger({ service: "web", env: "local" });

    expect(readProcessLogContext()).toEqual({ service: "web", env: "local" });
  });
});
