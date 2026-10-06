import { afterEach, describe, expect, it } from "vitest";
import { createLogRing, disableProcessLogBuffer, LOG_BUFFER_CAPACITY, readProcessLogBuffer } from "./log-buffer.ts";
import type { LogRecord } from "./logger.ts";
import { configureProcessLogger, createProcessLogger } from "./process-logger.ts";

const record = (index: number): LogRecord => ({
  timestamp: "2026-10-01T12:00:00.000Z",
  level: "info",
  message: `line_${String(index)}`,
  service: "web",
  env: "local",
});

afterEach(() => {
  disableProcessLogBuffer();
  configureProcessLogger({ service: "test", env: "test" });
});

describe("log ring", () => {
  it("keeps the last 500 records, oldest first", () => {
    const ring = createLogRing();
    for (let index = 0; index < LOG_BUFFER_CAPACITY + 20; index += 1) ring.push(record(index));
    const kept = ring.snapshot();
    expect(kept).toHaveLength(500);
    expect(kept[0]?.message).toBe("line_20");
    expect(kept.at(-1)?.message).toBe("line_519");
  });
});

describe("process log buffer", () => {
  it("keeps the process logger's records once the local environment is configured, and still writes them", () => {
    const written: LogRecord[] = [];
    const logger = createProcessLogger({ sink: (line) => void written.push(line) });
    configureProcessLogger({ service: "web", env: "local" });
    logger.info("order_placed", { requestId: "r1" });
    expect(readProcessLogBuffer()?.map((line) => [line.message, line.service, line["requestId"]])).toEqual([
      ["order_placed", "web", "r1"],
    ]);
    expect(written.map((line) => line.message)).toEqual(["order_placed"]);
  });

  it("keeps nothing outside local", () => {
    const logger = createProcessLogger({ sink: () => undefined });
    configureProcessLogger({ service: "web", env: "prod" });
    logger.info("order_placed");
    expect(readProcessLogBuffer()).toBeNull();
  });
});
