import type { ReportError } from "@core/client/app-shell";

/** One structured log entry (rules/observability.md field names). */
export type DesktopLogEntry = {
  readonly timestamp: string;
  readonly level: "error";
  readonly message: "desktop_client_error";
  readonly service: "desktop";
  readonly env: string;
  readonly operation: string;
  /** Name and stable code only: messages may carry user data (no PII in logs). */
  readonly err: { readonly name: string; readonly code?: string };
};

const describeError = (error: unknown): DesktopLogEntry["err"] => {
  if (!(error instanceof Error)) return { name: "unknown" };
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? { name: error.name, code } : { name: error.name };
};

/**
 * `ReportError` of the shell (session boot, error boundary, UI store rehydrate) for the desktop:
 * one structured entry per failure handed to `sink` (the webview console until a log transport
 * exists), never the error message.
 */
export const createDesktopErrorReporter =
  (args: { appEnv: string; sink: (entry: DesktopLogEntry) => void; now?: () => Date }): ReportError =>
  (error, context) => {
    const now = args.now ?? (() => new Date());
    args.sink({
      timestamp: now().toISOString(),
      level: "error",
      message: "desktop_client_error",
      service: "desktop",
      env: args.appEnv,
      operation: context.operation,
      err: describeError(error),
    });
  };
