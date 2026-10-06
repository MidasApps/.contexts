import type { LogRecord } from "./logger.ts";

/** How many records the local ring keeps (SP5 plan Task 13). */
export const LOG_BUFFER_CAPACITY = 500;

/** A fixed-size ring of the latest records, oldest first. */
export type LogRing = {
  readonly push: (record: LogRecord) => void;
  /** A copy, oldest first. */
  readonly snapshot: () => LogRecord[];
};

export const createLogRing = (capacity = LOG_BUFFER_CAPACITY): LogRing => {
  const records: LogRecord[] = [];
  return {
    push: (record) => {
      records.push(record);
      if (records.length > capacity) records.splice(0, records.length - capacity);
    },
    snapshot: () => [...records],
  };
};

// Process-wide, on globalThis under a registered symbol for the same reason as the log context
// (decision 0002): bundlers give instrumentation and route handlers separate module instances,
// and the ring written by one must be the ring read by the other.
const RING_KEY = Symbol.for("@core/services/process-log-ring");

type RingHolder = { [RING_KEY]?: LogRing };

const holder = globalThis as RingHolder;

/** Starts keeping the process logger's records (local environment only; idempotent). */
export const enableProcessLogBuffer = (): void => {
  holder[RING_KEY] ??= createLogRing();
};

/** Stops keeping records and drops the ring (tests). */
export const disableProcessLogBuffer = (): void => {
  delete holder[RING_KEY];
};

/** Called by the process logger for every record; a no-op unless the buffer is enabled. */
export const captureProcessLogRecord = (record: LogRecord): void => {
  holder[RING_KEY]?.push(record);
};

/** The kept records, oldest first; `null` when the buffer is not enabled in this process. */
export const readProcessLogBuffer = (): LogRecord[] | null => holder[RING_KEY]?.snapshot() ?? null;
