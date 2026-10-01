"use client";

import { useCallback } from "react";
import { useTranslations } from "use-intl";
import { ApiError } from "#/shared/api/api-error.ts";

/** A failure as the UI shows it: translated copy for its code and the reference for support. */
export type DescribedError = {
  readonly code: string;
  readonly message: string;
  readonly requestId: string | undefined;
  /** HTTP status; `0` without a response, `undefined` for non-API failures. */
  readonly status: number | undefined;
};

/**
 * Turns a thrown value into copy (`errors.<CODE>`, falling back to `errors.INTERNAL_ERROR`) and the
 * `requestId` of the envelope. Never exposes the raw message (contracts/api.md §6: English, generic).
 * @example const describe = useDescribeError(); notify.error(describe(error).message);
 */
export const useDescribeError = (): ((error: unknown) => DescribedError) => {
  const t = useTranslations("errors");
  return useCallback(
    (error: unknown): DescribedError => {
      const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
      const known = t.has(code) ? code : "INTERNAL_ERROR";
      return {
        code,
        message: t(known),
        requestId: error instanceof ApiError ? error.requestId : undefined,
        status: error instanceof ApiError ? error.status : undefined,
      };
    },
    [t],
  );
};
