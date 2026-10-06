"use client";

import type { ComponentProps } from "react";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { ErrorState } from "./ErrorState.tsx";
import { isSessionLost, SignInAgainButton } from "./SignInAgainButton.tsx";

export type ApiErrorStateProps = Omit<ComponentProps<typeof ErrorState>, "description" | "requestId"> & {
  /** The failure of a query or mutation (an `ApiError` or anything thrown). */
  error: unknown;
};

/**
 * `ErrorState` for a failed `/v1` call: the copy of its code (`errors.<CODE>`) and its `requestId`,
 * never the raw message. Pass `onRetry` (the query's `refetch`) and `retrying` (`isFetching`). A
 * 401 (the session is gone; retrying cannot help) offers "sign in again" instead of the retry.
 */
export function ApiErrorState({ error, ...props }: ApiErrorStateProps) {
  const described = useDescribeError()(error);
  // `action` wins over the retry in ErrorState.
  const action = isSessionLost(error) ? <SignInAgainButton variant="secondary" /> : props.action;
  return <ErrorState description={described.message} requestId={described.requestId} {...props} action={action} />;
}
