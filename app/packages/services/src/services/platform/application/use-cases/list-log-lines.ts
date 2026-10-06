import type { LogLine, LogLineLevel } from "@core/contracts";
import type { LogRecord } from "#/services/shared/observability/logger.ts";

export type LogLinesQuery = {
  /** Minimum level. */
  readonly level?: LogLineLevel | undefined;
  /** Text the message contains (case-insensitive). */
  readonly q?: string | undefined;
  readonly traceId?: string | undefined;
  readonly requestId?: string | undefined;
  readonly limit: number;
};

const RANK: Readonly<Record<LogLineLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };
const BASE_FIELDS: ReadonlySet<string> = new Set([
  "timestamp",
  "level",
  "message",
  "service",
  "env",
  "requestId",
  "traceId",
]);
const MAX_STACK_CHARS = 2000;

const textOrNull = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

// A stack can be very long; the console shows its head, the process output keeps all of it.
const trimStack = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const stack = (value as Record<string, unknown>)["stack"];
  return typeof stack === "string" && stack.length > MAX_STACK_CHARS
    ? { ...value, stack: stack.slice(0, MAX_STACK_CHARS) }
    : value;
};

const toLine = (record: LogRecord): LogLine => ({
  timestamp: record.timestamp,
  level: record.level,
  message: record.message,
  service: record.service,
  env: record.env,
  requestId: textOrNull(record["requestId"]),
  traceId: textOrNull(record["traceId"]),
  fields: Object.fromEntries(
    Object.entries(record).flatMap(([key, value]) =>
      BASE_FIELDS.has(key) ? [] : [[key, key === "err" ? trimStack(value) : value]],
    ),
  ),
});

/**
 * The latest lines of the ring, newest first, filtered by minimum level, message text, trace and
 * request (SP5 spec §6 `/admin/logs`). The logger already keeps PII out of its fields
 * (rules/observability.md), so nothing is redacted here.
 * @param records the ring's records, oldest first.
 */
export const listLogLines = (records: readonly LogRecord[], query: LogLinesQuery): LogLine[] => {
  const minimum = RANK[query.level ?? "debug"];
  const needle = query.q?.toLocaleLowerCase("en-US");
  const lines: LogLine[] = [];
  for (let index = records.length - 1; index >= 0 && lines.length < query.limit; index -= 1) {
    const record = records[index];
    if (record === undefined || RANK[record.level] < minimum) continue;
    if (needle !== undefined && !record.message.toLocaleLowerCase("en-US").includes(needle)) continue;
    if (query.traceId !== undefined && record["traceId"] !== query.traceId) continue;
    if (query.requestId !== undefined && record["requestId"] !== query.requestId) continue;
    lines.push(toLine(record));
  }
  return lines;
};
