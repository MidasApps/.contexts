import type { PageMeta } from "@core/contracts";
import { infiniteQueryOptions, type InfiniteData } from "@tanstack/react-query";
import { ApiError } from "./api-error.ts";
import type { QueryKey } from "./query-keys.ts";

/** One page of a cursor-paginated `/v1` list (contracts/api.md §5.2, §9.1). */
export type ListPage<T> = { readonly data: readonly T[]; readonly meta: { readonly page: PageMeta } };

/** Fetches one page; `cursor` is `undefined` for the first page. */
export type FetchPage<T> = (cursor: string | undefined, signal: AbortSignal) => Promise<ListPage<T>>;

/** Upper bound for `collectAllPages` (catalogs and pickers, never tables): 20 pages × 100 items. */
export const MAX_COLLECTED_PAGES = 20;

/** Page size used by lists the client reads whole (catalogs, trees, switchers). */
export const COLLECT_PAGE_LIMIT = 100;

/** The cursor of the next page, or `undefined` at the end. */
export const nextCursor = (page: ListPage<unknown>): string | undefined =>
  page.meta.page.hasMore && page.meta.page.cursor !== null ? page.meta.page.cursor : undefined;

/** The items of a list read whole, and whether the page cap left some out. */
export type CollectedPages<T> = { readonly items: T[]; readonly truncated: boolean };

/**
 * Reads every page of a list in order, stopping at `maxPages` so a runaway cursor cannot loop
 * forever; `truncated` is `true` when it stopped with a next page still announced, so a view that
 * counts or totals the items can say they are partial.
 */
export const collectPages = async <T>(fetchPage: FetchPage<T>, signal: AbortSignal, maxPages = MAX_COLLECTED_PAGES): Promise<CollectedPages<T>> => {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let index = 0; index < maxPages; index += 1) {
    const page = await fetchPage(cursor, signal);
    items.push(...page.data);
    cursor = nextCursor(page);
    if (cursor === undefined) return { items, truncated: false };
  }
  return { items, truncated: true };
};

/**
 * Reads every page of a short list in order (unit types, permissions, the units under one parent),
 * stopping at `maxPages`; use `collectPages` where a silently partial list would mislead.
 */
export const collectAllPages = async <T>(fetchPage: FetchPage<T>, signal: AbortSignal, maxPages = MAX_COLLECTED_PAGES): Promise<T[]> =>
  (await collectPages(fetchPage, signal, maxPages)).items;

/** Merges the loaded pages of an infinite list into one array, oldest page first. */
export const mergePages = <T>(data: InfiniteData<ListPage<T>, string | undefined>): readonly T[] => data.pages.flatMap((page) => page.data);

/**
 * Infinite query options over a cursor list: `fetchNextPage()` loads the next cursor and `data` is
 * the merged items of every loaded page (`hasNextPage` tells whether more exist).
 */
export const cursorListQuery = <T>(args: { queryKey: QueryKey; fetchPage: FetchPage<T> }) =>
  infiniteQueryOptions({
    queryKey: args.queryKey,
    queryFn: ({ pageParam, signal }) => args.fetchPage(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    select: mergePages<T>,
  });

/** `true` when a failed `/v1` call answered `status` (404 = not visible, 403 = no permission). */
export const isApiErrorStatus = (error: unknown, status: number): boolean => error instanceof ApiError && error.status === status;

/**
 * Runs a read and turns a 404 into `null` (SP1 answers 404 for resources the caller cannot see):
 * views render not-found for `null` and keep every other failure as an error.
 */
export const nullOnNotFound = async <T>(read: () => Promise<T>): Promise<T | null> => {
  try {
    return await read();
  } catch (error: unknown) {
    if (isApiErrorStatus(error, 404)) return null;
    throw error;
  }
};

/** `?limit=…&cursor=…` of a list call (the cursor only when there is one). */
export const pageQuery = (cursor: string | undefined, limit: number): { limit: number; cursor?: string } =>
  cursor === undefined ? { limit } : { limit, cursor };
