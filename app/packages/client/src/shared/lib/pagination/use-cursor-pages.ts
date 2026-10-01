"use client";

import { useState } from "react";

/** The parts of an infinite cursor query (`cursorListQuery` + `useInfiniteQuery`) paging needs. */
export type CursorListState<T> = {
  readonly data: readonly T[] | undefined;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly fetchNextPage: () => Promise<unknown>;
};

/** Structurally the `DataTablePagination` props (shared/lib does not depend on shared/ui). */
export type CursorPagination = {
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly pending: boolean;
  readonly label?: string;
};

export type CursorPages<T> = {
  /** Rows of the page on screen. */
  readonly rows: readonly T[];
  /** Previous/next for `DataTable`; `undefined` while everything fits one page. */
  readonly pagination: CursorPagination | undefined;
};

/**
 * Previous/next paging over an infinite cursor list (contracts/api.md §9: opaque cursors, no page
 * numbers). Loaded pages stay cached, so "previous" never refetches; "next" fetches the next cursor
 * only when it is not loaded yet. The index is clamped when rows disappear (a revoke on the last page).
 */
export const useCursorPages = <T>(query: CursorListState<T>, pageSize: number, label?: string): CursorPages<T> => {
  const [requested, setRequested] = useState(0);
  const all = query.data ?? [];
  const lastLoaded = Math.max(0, Math.ceil(all.length / pageSize) - 1);
  const index = Math.min(requested, lastLoaded);
  const loadedAhead = all.length > (index + 1) * pageSize;
  const hasNext = loadedAhead || query.hasNextPage;
  const next = async (): Promise<void> => {
    if (!loadedAhead) await query.fetchNextPage();
    setRequested(index + 1);
  };
  const pagination: CursorPagination | undefined =
    index === 0 && !hasNext
      ? undefined
      : {
          hasPrevious: index > 0,
          hasNext,
          pending: query.isFetchingNextPage,
          onPrevious: () => setRequested(Math.max(0, index - 1)),
          onNext: () => void next(),
          ...(label === undefined ? {} : { label }),
        };
  return { rows: all.slice(index * pageSize, (index + 1) * pageSize), pagination };
};
