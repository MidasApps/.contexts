import type { ReportError } from "@core/client/app-shell";

/** One structured browser log entry (rules/observability.md field names). */
export type WebClientLogEntry = {
  readonly timestamp: string;
  readonly level: "error";
  readonly message: "web_client_error";
  readonly service: "web";
  readonly env: string;
  readonly operation: string;
  /** Name and stable code only: messages may carry user data (no PII in logs). */
  readonly err: { readonly name: string; readonly code?: string };
};

const describeError = (error: unknown): WebClientLogEntry["err"] => {
  if (!(error instanceof Error)) return { name: "unknown" };
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? { name: error.name, code } : { name: error.name };
};

/**
 * `ReportError` of the shell (session boot, error boundary, UI store rehydrate) in the browser:
 * one structured entry per failure handed to `sink`, never the error message.
 */
export const createWebErrorReporter =
  (args: { appEnv: string; sink: (entry: WebClientLogEntry) => void; now?: () => Date }): ReportError =>
  (error, context) => {
    const now = args.now ?? (() => new Date());
    args.sink({
      timestamp: now().toISOString(),
      level: "error",
      message: "web_client_error",
      service: "web",
      env: args.appEnv,
      operation: context.operation,
      err: describeError(error),
    });
  };
