"use client";

import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { useRouteSearch, type RouteSearch } from "#/shared/lib/router/use-route-search.ts";

export type AdminSearch<K extends string> = RouteSearch<K>;

/**
 * Filters and paging of an `/admin` page kept in the query string (SP5: a filtered list is a link
 * staff can share). Every other query parameter of the page is preserved.
 * @example const search = useAdminSearch(["status", "organizationId"]); search.set({ status: "error" });
 */
export const useAdminSearch = <K extends string>(keys: readonly K[]): AdminSearch<K> => {
  const rest = useRouter().useRouteParams()["rest"] ?? "";
  return useRouteSearch(keys, (search) => ({ id: "admin", rest, search }));
};

/** `DataTable` paging for lists paged by number (`page`/`perPage` + `meta.hasMore`, decision 0040). */
export const numberedPagination = (search: { page: number; setPage: (page: number) => void }, state: { hasMore: boolean; pending: boolean }, label?: string) =>
  search.page === 1 && !state.hasMore
    ? undefined
    : {
        hasPrevious: search.page > 1,
        hasNext: state.hasMore,
        pending: state.pending,
        onPrevious: () => search.setPage(search.page - 1),
        onNext: () => search.setPage(search.page + 1),
        ...(label === undefined ? {} : { label }),
      };
