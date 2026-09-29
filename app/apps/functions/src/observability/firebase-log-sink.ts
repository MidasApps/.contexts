import type { LogLevel, LogSink } from "@core/services";
import type { LogEntry, LogSeverity } from "firebase-functions/logger";

const SEVERITY_BY_LEVEL: Record<LogLevel, LogSeverity> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
};

/**
 * Routes the shared structured logger through `firebase-functions/logger`,
 * the only log channel the Functions stack allows: Cloud Logging reads
 * `severity` and keeps every other field as the JSON payload.
 * @param deps.write usually `write` from `firebase-functions/logger`.
 */
export const makeFirebaseLogSink =
  (deps: { write: (entry: LogEntry) => void }): LogSink =>
  (record) => {
    deps.write({ ...record, severity: SEVERITY_BY_LEVEL[record.level] });
  };
