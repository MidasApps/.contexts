/**
 * Structured JSON logger (rules/observability.md): every line carries
 * `timestamp, level, message, service, env`, plus `requestId`/`traceId` and
 * `durationMs` when the caller has them. The only place that writes to the
 * output streams; other runtime code never calls `console`.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Process-wide fields: which service emits and in which logical env (`APP_ENV`). */
export type LogContext = { service: string; env: string };

/** Variable data goes in fields; `message` stays a stable snake_case event name. */
export type LogFields = {
  requestId?: string;
  traceId?: string;
  durationMs?: number;
  err?: unknown;
  [field: string]: unknown;
};

export type SerializedError = { name: string; message: string; stack?: string };

export type LogRecord = LogContext & {
  timestamp: string;
  level: LogLevel;
  message: string;
  [field: string]: unknown;
};

export type LogSink = (record: LogRecord) => void;

export type Logger = Record<LogLevel, (message: string, fields?: LogFields) => void>;

export const serializeError = (err: unknown): SerializedError => {
  if (err instanceof Error) {
    return err.stack === undefined
      ? { name: err.name, message: err.message }
      : { name: err.name, message: err.message, stack: err.stack };
  }
  return { name: "NonError", message: String(err) };
};

/**
 * One JSON line per record; errors go to stderr so platforms can split streams.
 * `console` (not `process.stdout`) keeps the sink valid in every Next.js
 * runtime the bundler analyzes (proxy, instrumentation, route handlers).
 */
export const jsonLineSink: LogSink = (record) => {
  const line = JSON.stringify(record);
  // The single sanctioned console call site: every other module logs through a Logger.
  // eslint-disable-next-line no-console
  if (record.level === "error") console.error(line);
  // eslint-disable-next-line no-console
  else console.log(line);
};

const buildRecord = (args: {
  level: LogLevel;
  message: string;
  fields: LogFields;
  context: LogContext;
  now: () => Date;
}): LogRecord => {
  const { err, ...rest } = args.fields;
  return {
    ...rest,
    ...(err === undefined ? {} : { err: serializeError(err) }),
    // Base fields last: a caller field can never override them.
    timestamp: args.now().toISOString(),
    level: args.level,
    message: args.message,
    service: args.context.service,
    env: args.context.env,
  };
};

/**
 * @param args.context fixed, or read on every call so a boot-time
 *   configuration (see `process-logger.ts`) applies to loggers built earlier.
 */
export const createLogger = (args: {
  context: LogContext | (() => LogContext);
  sink?: LogSink;
  now?: () => Date;
}): Logger => {
  const { context, sink = jsonLineSink, now = () => new Date() } = args;
  const readContext = typeof context === "function" ? context : () => context;
  const logAt =
    (level: LogLevel) =>
    (message: string, fields: LogFields = {}) =>
      sink(buildRecord({ level, message, fields, context: readContext(), now }));
  return { debug: logAt("debug"), info: logAt("info"), warn: logAt("warn"), error: logAt("error") };
};
