"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { queryKeys } from "#/shared/api/query-keys.ts";
import { useAuth } from "#/shared/lib/auth/auth-context.tsx";
import type { EnrolledFactor } from "#/shared/lib/auth/auth-port.ts";
import { useAuthState } from "#/shared/lib/auth/use-auth-state.ts";

/**
 * The signed-in user's second factors as Firebase reports them (re-read when the auth state
 * changes). The SDK does not notify factor changes, so `refresh` re-reads them after an
 * enroll/unenroll and refetches `me` (`mfaEnrolled`).
 */
export const useEnrolledFactors = (): { factors: readonly EnrolledFactor[]; refresh: () => Promise<void> } => {
  const auth = useAuth();
  const state = useAuthState();
  const queryClient = useQueryClient();
  const [version, setVersion] = useState(0);
  // `state` and `version` are the triggers: the factors live in the SDK, not in React state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const factors = useMemo(() => auth.getEnrolledFactors(), [auth, state, version]);
  const refresh = useCallback(async () => {
    setVersion((current) => current + 1);
    await queryClient.invalidateQueries({ queryKey: queryKeys.me(), exact: true });
  }, [queryClient]);
  return { factors, refresh };
};
