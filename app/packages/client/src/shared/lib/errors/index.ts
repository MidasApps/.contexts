// Public API of shared/lib/errors: failure → translated copy + request reference.
export { useDescribeError, type DescribedError } from "./describe-error.ts";
export { ErrorReporterProvider, useReportError, type ErrorReporter } from "./error-reporter.tsx";
export { useConfirmedAction, type ConfirmedAction } from "./use-confirmed-action.ts";
