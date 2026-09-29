import { describe, expect, it, vi } from "vitest";
import { createLogger, type LogRecord } from "./logger.ts";

const FIXED_NOW = new Date("2026-09-29T12:00:00.000Z");

const makeCapturingLogger = (context = { service: "web", env: "local" }) => {
  const records: LogRecord[] = [];
  const logger = createLogger({ context, sink: (record) => records.push(record), now: () => FIXED_NOW });
  return { logger, records };
};

describe("createLogger", () => {
  it("emits the stable base fields plus the structured fields", () => {
    const { logger, records } = makeCapturingLogger();

    logger.info("health_checked", { requestId: "01K6BZ3YQ8X4M7N2P5R9T0V1W2", durationMs: 3 });

    expect(records).toEqual([
      {
        timestamp: "2026-09-29T12:00:00.000Z",
        level: "info",
        message: "health_checked",
        service: "web",
        env: "local",
        requestId: "01K6BZ3YQ8X4M7N2P5R9T0V1W2",
        durationMs: 3,
      },
    ]);
  });

  it("serializes an error into name, message and stack", () => {
    const { logger, records } = makeCapturingLogger();

    logger.error("health_failed", { err: new TypeError("boom") });

    expect(records[0]).toMatchObject({
      level: "error",
      err: { name: "TypeError", message: "boom", stack: expect.stringContaining("TypeError: boom") as string },
    });
  });

  it("serializes a thrown non-error value without a stack", () => {
    const { logger, records } = makeCapturingLogger();

    logger.error("health_failed", { err: "plain string" });

    expect(records[0]).toMatchObject({ err: { name: "NonError", message: "plain string" } });
  });

  it("keeps the base fields when a caller tries to override them", () => {
    const { logger, records } = makeCapturingLogger();

    logger.warn("override_attempted", { service: "other", level: "debug" });

    expect(records[0]).toMatchObject({ level: "warn", service: "web", message: "override_attempted" });
  });

  it("writes one JSON line per record by default, errors to stderr", () => {
    const stdout = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logger = createLogger({ context: { service: "web", env: "local" }, now: () => FIXED_NOW });

    logger.info("health_checked");
    logger.error("health_failed");

    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({ level: "info", message: "health_checked" });
    expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toMatchObject({ level: "error", message: "health_failed" });
    vi.restoreAllMocks();
  });

  it("reads the context lazily so a boot-time configuration applies", () => {
    let context = { service: "unknown", env: "unknown" };
    const records: LogRecord[] = [];
    const logger = createLogger({
      context: () => context,
      sink: (record) => records.push(record),
      now: () => FIXED_NOW,
    });

    context = { service: "web", env: "staging" };
    logger.debug("configured");

    expect(records[0]).toMatchObject({ service: "web", env: "staging", level: "debug" });
  });
});
