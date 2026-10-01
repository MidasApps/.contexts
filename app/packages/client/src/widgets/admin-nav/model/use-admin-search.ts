"use client";

import { useRouter } from "#/shared/lib/router/router-context.tsx";

export type AdminSearch<K extends string> = {
  /** Current value of each filter; `undefined` when absent from the URL. */
  readonly values: Readonly<Record<K, string | undefined>>;
  /** 1-based page of a numbered list (`?page=`), 1 when absent or invalid. */
  readonly page: number;
  /**
   * Writes filters into the URL (replace, so "back" leaves the page). `undefined` or "" removes a
   * filter. Changing a filter returns to the first page.
   */
  readonly set: (patch: Partial<Record<K, string | undefined>>) => void;
  readonly setPage: (page: number) => void;
};

const PAGE = "page";

/**
 * Filters and paging of an `/admin` page kept in the query string (SP5: a filtered list is a link
 * staff can share). Every other query parameter of the page is preserved.
 * @example const search = useAdminSearch(["status", "organizationId"]); search.set({ status: "error" });
 */
export const useAdminSearch = <K extends string>(keys: readonly K[]): AdminSearch<K> => {
  const router = useRouter();
  const rest = router.useRouteParams()["rest"] ?? "";
  const params = new URLSearchParams(router.useSearch());
  const values = Object.fromEntries(keys.map((key) => [key, params.get(key) ?? undefined])) as Record<K, string | undefined>;
  const parsedPage = Number.parseInt(params.get(PAGE) ?? "1", 10);
  const write = (next: URLSearchParams): void => router.navigate({ id: "admin", rest, search: Object.fromEntries(next) }, { replace: true });
  return {
    values,
    page: Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1,
    set: (patch) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries<string | undefined>(patch)) {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      next.delete(PAGE);
      write(next);
    },
    setPage: (page) => {
      const next = new URLSearchParams(params);
      if (page <= 1) next.delete(PAGE);
      else next.set(PAGE, String(page));
      write(next);
    },
  };
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
