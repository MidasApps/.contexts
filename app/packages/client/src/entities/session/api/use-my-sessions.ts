"use client";

import { listSessionsEndpoint } from "@core/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { cursorListQuery, pageQuery } from "#/shared/api/cursor-list.ts";
import { type QueryKey, queryKeys } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Page size of the sessions table (profile/sessions). */
export const SESSIONS_PAGE_LIMIT = 20;

/** The user's sessions live under `["me"]`; revoking one invalidates `all`. */
export const sessionKeys = {
  all: (): QueryKey => [...queryKeys.me(), "sessions"],
  list: (limit: number): QueryKey => [...queryKeys.me(), "sessions", { limit }],
};

/** `GET /v1/me/sessions` (web and desktop sessions of the signed-in user), merged pages. */
export const mySessionsQuery = (callEndpoint: CallEndpoint, limit = SESSIONS_PAGE_LIMIT) =>
  cursorListQuery({
    queryKey: sessionKeys.list(limit),
    fetchPage: async (cursor, signal) =>
      callEndpoint(listSessionsEndpoint, { query: pageQuery(cursor, limit), signal }),
  });

/** Active sessions of the signed-in user; `fetchNextPage` loads more. */
export const useMySessions = () => {
  const callEndpoint = useCallEndpoint();
  return useInfiniteQuery({ ...mySessionsQuery(callEndpoint), enabled: useIsSignedIn() });
};
