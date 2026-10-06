"use client";

import { createContext, type ReactNode, use } from "react";

/**
 * Where client code reports a failure it handled itself (it showed a fallback and went on).
 * The apps pass their logger through `createClientApp({ adapters: { reportError } })`; the
 * context never carries user content — only the error and the operation name.
 */
export type ErrorReporter = (error: unknown, context: { readonly operation: string }) => void;

const ignore: ErrorReporter = () => undefined;

const ErrorReporterContext = createContext<ErrorReporter>(ignore);

export function ErrorReporterProvider({ reportError, children }: { reportError: ErrorReporter; children: ReactNode }) {
  return <ErrorReporterContext value={reportError}>{children}</ErrorReporterContext>;
}

/** The reporter of the app; a no-op outside a provider (tests, isolated components). */
export const useReportError = (): ErrorReporter => use(ErrorReporterContext);
