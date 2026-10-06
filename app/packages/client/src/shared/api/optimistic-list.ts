import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { ListPage } from "./cursor-list.ts";
import type { QueryKey } from "./query-keys.ts";

type Pages<T> = InfiniteData<ListPage<T>, string | undefined>;

/**
 * Optimistic change of every cached cursor list under `queryKey` (TanStack infinite data):
 * `change` maps each page's items. Returns a rollback that restores the snapshots (call it when
 * the mutation fails; invalidate afterwards either way so the server has the last word).
 * @example const rollback = await patchCachedLists(queryClient, sessionKeys.all(), (items) => items.filter((s) => s.id !== id));
 */
export const patchCachedLists = async <T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  change: (items: readonly T[]) => readonly T[],
): Promise<() => void> => {
  await queryClient.cancelQueries({ queryKey });
  const snapshots = queryClient.getQueriesData<Pages<T>>({ queryKey });
  queryClient.setQueriesData<Pages<T>>({ queryKey }, (data) =>
    data === undefined ? data : { ...data, pages: data.pages.map((page) => ({ ...page, data: change(page.data) })) },
  );
  return () => snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
};
