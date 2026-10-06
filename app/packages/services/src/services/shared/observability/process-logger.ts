import { captureProcessLogRecord, enableProcessLogBuffer } from "./log-buffer.ts";
import { createLogger, jsonLineSink, type LogContext, type Logger, type LogSink } from "./logger.ts";

const UNCONFIGURED: LogContext = Object.freeze({ service: "unknown", env: "unknown" });

// The one piece of process-wide logging state (decision app/docs/decisions/0002).
// Driving adapters are module singletons that Next.js loads by re-export, so they
// cannot receive the app's validated env through a constructor; each app's boot
// hook (web: `src/instrumentation.ts`) sets the context once, before any request.
// It lives on globalThis under a registered symbol because bundlers (Turbopack)
// give instrumentation and route handlers separate module instances. Nothing
// outside this file touches the holder.
const CONTEXT_KEY = Symbol.for("@core/services/process-log-context");

type ContextHolder = { [CONTEXT_KEY]?: Readonly<LogContext> };

const holder = globalThis as ContextHolder;

/**
 * Called once at boot with values from the app's validated `src/env.ts`. In `local` it also starts
 * the ring buffer the staff console reads (`GET /v1/admin/logs`, decision 0043); no other
 * environment keeps log lines in memory.
 */
export const configureProcessLogger = (context: LogContext): void => {
  holder[CONTEXT_KEY] = Object.freeze({ ...context });
  if (context.env === "local") enableProcessLogBuffer();
};

export const readProcessLogContext = (): Readonly<LogContext> => holder[CONTEXT_KEY] ?? UNCONFIGURED;

/**
 * Logger bound to the process context. The first record written before
 * `configureProcessLogger` ran is preceded by one `process_logger_unconfigured`
 * warning, so a missing boot hook shows up in the logs instead of silently
 * producing `service: "unknown"`.
 */
export const createProcessLogger = (args: { sink?: LogSink } = {}): Logger => {
  const sink = args.sink ?? jsonLineSink;
  let hasWarned = false;
  const warnOnceWhenUnconfigured: LogSink = (record) => {
    if (!hasWarned && holder[CONTEXT_KEY] === undefined) {
      hasWarned = true;
      const { timestamp, service, env } = record;
      sink({ timestamp, level: "warn", message: "process_logger_unconfigured", service, env });
    }
    sink(record);
    // The sink is fixed when the logger is built, so the ring is reached through globalThis on
    // every record: a no-op until `configureProcessLogger` enabled it.
    captureProcessLogRecord(record);
  };
  return createLogger({ context: readProcessLogContext, sink: warnOnceWhenUnconfigured });
};

/** Default logger for driving adapters; tests build their own with `createLogger`. */
export const processLogger: Logger = createProcessLogger();
