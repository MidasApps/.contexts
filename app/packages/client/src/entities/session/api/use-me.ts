"use client";

import type { Me } from "@core/contracts";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { meQuery } from "#/shared/api/core-queries.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/**
 * The signed-in user (`GET /v1/me`): profile, preferences, `lastContext`, staff flags. Shares the
 * app shell's cache entry (`meQuery`); disabled until the session is signed in.
 */
export const useMe = (): UseQueryResult<Me> => {
  const callEndpoint = useCallEndpoint();
  return useQuery({ ...meQuery(callEndpoint), enabled: useIsSignedIn() });
};
