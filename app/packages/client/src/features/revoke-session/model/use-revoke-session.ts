"use client";

import { revokeAllSessionsEndpoint, revokeSessionEndpoint, type SessionSummary } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { sessionKeys } from "#/entities/session/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { patchCachedLists } from "#/shared/api/optimistic-list.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { useSession } from "#/shared/lib/session/session-context.tsx";

/**
 * `DELETE /v1/me/sessions/{id}`: the row leaves the table at once and comes back if the call fails
 * (the caller shows the error); the list refetches either way.
 * @throws {ApiError} when the server refuses.
 */
export const useRevokeSession = (): ((sessionId: string) => Promise<void>) => {
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  return useCallback(
    async (sessionId: string) => {
      const rollback = await patchCachedLists<SessionSummary>(queryClient, sessionKeys.all(), (items) => items.filter((item) => item.id !== sessionId));
      try {
        await callEndpoint(revokeSessionEndpoint, { params: { sessionId } });
      } catch (error: unknown) {
        rollback();
        throw error;
      } finally {
        void queryClient.invalidateQueries({ queryKey: sessionKeys.all() });
      }
    },
    [callEndpoint, queryClient],
  );
};

/**
 * "Sign out everywhere" (SP1 spec §3.3 step 5): the server revokes every session and refresh
 * token, so this device is signed out too — the session provider clears local state and the user
 * lands on sign-in.
 * @throws {ApiError} when the server refuses (nothing was revoked; the user stays signed in).
 */
export const useRevokeAllSessions = (): (() => Promise<void>) => {
  const callEndpoint = useCallEndpoint();
  const session = useSession();
  const router = useRouter();
  return useCallback(async () => {
    await callEndpoint(revokeAllSessionsEndpoint, {});
    try {
      await session.signOut();
    } finally {
      router.navigate({ id: "sign-in" }, { replace: true });
    }
  }, [callEndpoint, router, session]);
};
