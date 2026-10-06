import { createLogger } from "@core/services";
import type { LogEntry } from "firebase-functions/logger";
import { describe, expect, it } from "vitest";
import { makeFirebaseLogSink } from "./firebase-log-sink.ts";

const NOW = new Date("2026-09-29T12:00:00.000Z");

const makeLogger = () => {
  const entries: LogEntry[] = [];
  const logger = createLogger({
    context: { service: "functions", env: "local" },
    sink: makeFirebaseLogSink({ write: (entry) => entries.push(entry) }),
    now: () => NOW,
  });
  return { logger, entries };
};

describe("makeFirebaseLogSink", () => {
  it("writes the structured record with the Cloud Logging severity of its level", () => {
    const { logger, entries } = makeLogger();

    logger.info("health_checked_ok", { requestId: "01K6BZ3YQ8X4M7N2P5R9T0V1W2", durationMs: 1 });

    expect(entries).toEqual([
      {
        severity: "INFO",
        message: "health_checked_ok",
        level: "info",
        timestamp: NOW.toISOString(),
        service: "functions",
        env: "local",
        requestId: "01K6BZ3YQ8X4M7N2P5R9T0V1W2",
        durationMs: 1,
      },
    ]);
  });

  it.each([
    ["debug", "DEBUG"],
    ["warn", "WARNING"],
    ["error", "ERROR"],
  ] as const)("maps level %s to severity %s", (level, severity) => {
    const { logger, entries } = makeLogger();

    logger[level]("something_happened");

    expect(entries[0]?.severity).toBe(severity);
  });
});
