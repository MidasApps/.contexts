"use client";

import type { ComponentProps } from "react";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { ErrorState } from "./ErrorState.tsx";

export type ApiErrorStateProps = Omit<ComponentProps<typeof ErrorState>, "description" | "requestId"> & {
  /** The failure of a query or mutation (an `ApiError` or anything thrown). */
  error: unknown;
};

/**
 * `ErrorState` for a failed `/v1` call: the copy of its code (`errors.<CODE>`) and its `requestId`,
 * never the raw message. Pass `onRetry` (the query's `refetch`) and `retrying` (`isFetching`).
 */
export function ApiErrorState({ error, ...props }: ApiErrorStateProps) {
  const described = useDescribeError()(error);
  return <ErrorState description={described.message} requestId={described.requestId} {...props} />;
}
