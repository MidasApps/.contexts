import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogRecord } from "./logger.ts";
import { configureProcessLogger, createProcessLogger, readProcessLogContext } from "./process-logger.ts";

const CONTEXT_KEY = Symbol.for("@core/services/process-log-context");
type ContextHolder = { [CONTEXT_KEY]?: unknown };
const holder = globalThis as ContextHolder;

describe("process logger", () => {
  let saved: unknown;

  // The context is process-wide: snapshot and restore it so each test starts
  // unconfigured and runs in any order.
  beforeEach(() => {
    saved = holder[CONTEXT_KEY];
    delete holder[CONTEXT_KEY];
  });

  afterEach(() => {
    if (saved === undefined) delete holder[CONTEXT_KEY];
    else holder[CONTEXT_KEY] = saved;
  });

  it("replaces the unconfigured context with the boot-time service and env", () => {
    expect(readProcessLogContext()).toEqual({ service: "unknown", env: "unknown" });

    configureProcessLogger({ service: "web", env: "local" });

    expect(readProcessLogContext()).toEqual({ service: "web", env: "local" });
  });

  it("stores a frozen copy that later caller mutations cannot change", () => {
    const context = { service: "web", env: "local" };

    configureProcessLogger(context);
    context.env = "prod";

    expect(readProcessLogContext()).toEqual({ service: "web", env: "local" });
    expect(Object.isFrozen(readProcessLogContext())).toBe(true);
  });

  it("shares the context with a separately loaded module instance", async () => {
    configureProcessLogger({ service: "web", env: "staging" });
    vi.resetModules();

    const fresh = await import("./process-logger.ts");

    expect(fresh.readProcessLogContext()).toEqual({ service: "web", env: "staging" });
  });

  it("warns once when used before configuration", () => {
    const records: LogRecord[] = [];
    const logger = createProcessLogger({ sink: (record) => records.push(record) });

    logger.info("first_event");
    logger.info("second_event");

    expect(records.map((record) => [record.level, record.message])).toEqual([
      ["warn", "process_logger_unconfigured"],
      ["info", "first_event"],
      ["info", "second_event"],
    ]);
  });

  it("does not warn once configured", () => {
    configureProcessLogger({ service: "web", env: "local" });
    const records: LogRecord[] = [];
    const logger = createProcessLogger({ sink: (record) => records.push(record) });

    logger.info("first_event");

    expect(records).toEqual([expect.objectContaining({ message: "first_event", service: "web" })]);
  });
});
