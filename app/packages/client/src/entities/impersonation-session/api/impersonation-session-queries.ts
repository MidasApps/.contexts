"use client";

import { type AdminImpersonationSession, adminListImpersonationSessionsEndpoint } from "@core/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { cursorListQuery, pageQuery } from "#/shared/api/cursor-list.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const IMPERSONATION_SESSIONS_PAGE_LIMIT = 20;

/** `active`: the sessions still open; `all`: every session, newest first. */
export type ImpersonationSessionScope = "active" | "all";

/** Staff data lives under `["admin", …]`: starting or ending a session invalidates `all`. */
export const impersonationSessionKeys = {
  all: (): QueryKey => ["admin", "impersonation-sessions"],
  list: (scope: ImpersonationSessionScope): QueryKey => ["admin", "impersonation-sessions", "list", scope],
};

/**
 * `GET /v1/admin/impersonation-sessions` (staff, platform.user.read; decision 0044): support
 * access sessions of every staff member, one cursor page at a time.
 */
export const adminImpersonationSessionsQuery = (callEndpoint: CallEndpoint, scope: ImpersonationSessionScope) =>
  cursorListQuery<AdminImpersonationSession>({
    queryKey: impersonationSessionKeys.list(scope),
    fetchPage: async (cursor, signal) =>
      callEndpoint(adminListImpersonationSessionsEndpoint, {
        query: {
          ...pageQuery(cursor, IMPERSONATION_SESSIONS_PAGE_LIMIT),
          ...(scope === "active" ? { status: "active" as const } : {}),
        },
        signal,
      }),
  });

export const useAdminImpersonationSessions = (
  scope: ImpersonationSessionScope,
  options: { enabled?: boolean } = {},
) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useInfiniteQuery({
    ...adminImpersonationSessionsQuery(callEndpoint, scope),
    enabled: signedIn && options.enabled !== false,
  });
};
