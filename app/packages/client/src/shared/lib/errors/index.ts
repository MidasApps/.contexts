// Public API of shared/lib/errors: failure → translated copy + request reference.
export { type DescribedError, useDescribeError } from "./describe-error.ts";
export { type ErrorReporter, ErrorReporterProvider, useReportError } from "./error-reporter.tsx";
export { type ConfirmedAction, useConfirmedAction } from "./use-confirmed-action.ts";
