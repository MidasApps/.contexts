import type { InfiniteData } from "@tanstack/react-query";
import type { ListPage } from "./cursor-list.ts";

/** How often a list re-reads while one of its visible rows is still running. */
export const LIVE_LIST_POLL_MS = 5000;

/**
 * `refetchInterval` of a cursor list: poll while any loaded row is still live (a run that can
 * change, an experiment still running), stop once every row has settled. Lists of running work
 * otherwise show "running" until a reload, and staff may cancel what already finished.
 */
export const pollWhileAnyLive =
  <T>(isLive: (item: T) => boolean) =>
  (data: InfiniteData<ListPage<T>, unknown> | undefined): number | false =>
    data?.pages.some((page) => page.data.some(isLive)) === true ? LIVE_LIST_POLL_MS : false;

/** The same for a numbered page (`{ data }`). */
export const pollWhilePageLive =
  <T>(isLive: (item: T) => boolean) =>
  (page: { readonly data: readonly T[] } | undefined): number | false =>
    page?.data.some(isLive) === true ? LIVE_LIST_POLL_MS : false;
