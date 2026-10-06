"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "use-intl";
import { useDescribeError } from "./describe-error.ts";

export type ConfirmedAction = {
  /** Translated failure of the last attempt (code copy plus reference), for `ConfirmDialog.error`. */
  readonly error: string | undefined;
  /** `ConfirmDialog.onConfirm`: `true` closes the dialog, `false` keeps it open with the error. */
  readonly confirm: () => Promise<boolean>;
  readonly reset: () => void;
};

/**
 * Wraps the action of a confirmation dialog (revoke, remove, delete): runs it, calls `onDone`
 * (usually a success toast) and closes; on failure keeps the dialog open with `errors.<CODE>` and
 * the request reference, so the user can retry or quote it.
 */
export const useConfirmedAction = (
  action: () => Promise<void>,
  onDone: () => void = () => undefined,
): ConfirmedAction => {
  const t = useTranslations("common.errorState");
  const describe = useDescribeError();
  const [error, setError] = useState<string | undefined>();
  const confirm = async (): Promise<boolean> => {
    setError(undefined);
    try {
      await action();
    } catch (failure: unknown) {
      const described = describe(failure);
      setError(
        described.requestId === undefined
          ? described.message
          : t("messageWithReference", { message: described.message, requestId: described.requestId }),
      );
      return false;
    }
    onDone();
    return true;
  };
  const reset = useCallback(() => setError(undefined), []);
  return { error, confirm, reset };
};
