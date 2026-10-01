"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "use-intl";
import { useDescribeError } from "./describe-error.ts";

export type AsyncAction = {
  /** The action is running: disable its button and show it pending. */
  readonly pending: boolean;
  /** Translated failure of the last run (code copy plus the request reference), for an inline alert. */
  readonly error: string | undefined;
  /** Runs `action`; resolves `true` on success, `false` after a failure (never rejects). */
  readonly run: (action: () => Promise<void>) => Promise<boolean>;
  readonly reset: () => void;
};

/**
 * Pending and error state of an inline write (a save button next to a field): no double submit,
 * and a failure becomes `errors.<CODE>` with the request reference instead of a rejection.
 */
export const useAsyncAction = (): AsyncAction => {
  const t = useTranslations("common.errorState");
  const describe = useDescribeError();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const run = async (action: () => Promise<void>): Promise<boolean> => {
    if (pending) return false;
    setPending(true);
    setError(undefined);
    try {
      await action();
      return true;
    } catch (failure: unknown) {
      const described = describe(failure);
      setError(described.requestId === undefined ? described.message : t("messageWithReference", { message: described.message, requestId: described.requestId }));
      return false;
    } finally {
      setPending(false);
    }
  };
  const reset = useCallback(() => setError(undefined), []);
  return { pending, error, run, reset };
};
