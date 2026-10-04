"use client";

import {
  ADMIN_USER_LOOKUP_MAX,
  type AdminUserSearchBy,
  type AdminUserSummary,
  adminListUsersEndpoint,
} from "@core/contracts";
import { queryOptions, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { cursorListQuery, pageQuery } from "#/shared/api/cursor-list.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";
import { adminUserLabel } from "../lib/admin-user-label.ts";

export const ADMIN_USERS_PAGE_LIMIT = 20;

/** What staff typed and how to read it; `by` absent lets the API decide (email, id, else name). */
export type AdminUserSearch = { readonly query: string; readonly by?: AdminUserSearchBy | undefined };

export const adminUserKeys = {
  all: (): QueryKey => ["admin", "users"],
  search: (search: AdminUserSearch): QueryKey => ["admin", "users", "search", search.by ?? "auto", search.query],
  names: (ids: readonly string[]): QueryKey => ["admin", "users", "names", ids],
};

/**
 * `GET /v1/admin/users?query=` (staff, platform.user.read): users whose name or email starts with
 * the text, or the user with that id, one cursor page at a time.
 */
export const adminUserSearchQuery = (callEndpoint: CallEndpoint, search: AdminUserSearch) =>
  cursorListQuery<AdminUserSummary>({
    queryKey: adminUserKeys.search(search),
    fetchPage: async (cursor, signal) =>
      callEndpoint(adminListUsersEndpoint, {
        query: {
          ...pageQuery(cursor, ADMIN_USERS_PAGE_LIMIT),
          query: search.query,
          ...(search.by === undefined ? {} : { by: search.by }),
        },
        signal,
      }),
  });

/** The search runs only once staff submit some text (`null` = nothing asked yet). */
export const useAdminUserSearch = (search: AdminUserSearch | null, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useInfiniteQuery({
    ...adminUserSearchQuery(callEndpoint, search ?? { query: "" }),
    enabled: signedIn && search !== null && options.enabled !== false,
  });
};

/** Distinct, sorted ids: the same set of users always makes the same query key. */
export const distinctSortedIds = (ids: readonly (string | null | undefined)[]): string[] =>
  [...new Set(ids.filter((id): id is string => typeof id === "string" && id !== ""))].sort();

const chunksOf = (ids: readonly string[], size: number): string[][] =>
  Array.from({ length: Math.ceil(ids.length / size) }, (_, index) => ids.slice(index * size, (index + 1) * size));

/**
 * `GET /v1/admin/users?ids=` (decision 0044): the users of a whole list in one call (one call per
 * 100 ids), never one call per row.
 */
export const adminUsersByIdQuery = (callEndpoint: CallEndpoint, ids: readonly string[]) =>
  queryOptions({
    queryKey: adminUserKeys.names(ids),
    queryFn: async ({ signal }): Promise<AdminUserSummary[]> => {
      const pages = await Promise.all(
        chunksOf(ids, ADMIN_USER_LOOKUP_MAX).map((chunk) =>
          callEndpoint(adminListUsersEndpoint, {
            query: { ids: chunk.join(","), limit: ADMIN_USER_LOOKUP_MAX },
            signal,
          }),
        ),
      );
      return pages.flatMap((page) => page.data);
    },
    // Names change rarely; a list that pages back and forth reuses what it already read.
    staleTime: 5 * 60_000,
    retry: false,
  });

/**
 * Names for the user ids a list shows (authors, run starters). Returns a resolver: the display
 * name, else the email, else the id itself. While loading, without `platform.user.read` or on any
 * failure it answers the id, so a list never waits for or breaks on the names.
 * @example const userLabel = useAdminUserNames(runs.map((run) => run.startedBy));
 */
export const useAdminUserNames = (
  ids: readonly (string | null | undefined)[],
  options: { enabled?: boolean } = {},
): ((id: string) => string) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  const key = distinctSortedIds(ids).join(",");
  const wanted = useMemo(() => (key === "" ? [] : key.split(",")), [key]);
  const users = useQuery({
    ...adminUsersByIdQuery(callEndpoint, wanted),
    enabled: signedIn && wanted.length > 0 && options.enabled !== false,
  });
  return useMemo(() => {
    const labels = new Map((users.data ?? []).map((user) => [user.id as string, adminUserLabel(user)]));
    return (id: string): string => labels.get(id) ?? id;
  }, [users.data]);
};
