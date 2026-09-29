import { createLogger, type LogContext, type Logger } from "./logger.ts";

const UNCONFIGURED: LogContext = { service: "unknown", env: "unknown" };

// The one piece of process-wide logging state. Driving adapters are module
// singletons that Next.js loads by re-export, so they cannot receive the app's
// validated env through a constructor; the app's boot hook (web:
// `src/instrumentation.ts`) sets the context once, before any request.
let processLogContext: LogContext = UNCONFIGURED;

/** Called once at boot with values from the app's validated `src/env.ts`. */
export const configureProcessLogger = (context: LogContext): void => {
  processLogContext = { ...context };
};

export const readProcessLogContext = (): LogContext => processLogContext;

/** Default logger for driving adapters; tests build their own with `createLogger`. */
export const processLogger: Logger = createLogger({ context: readProcessLogContext });
