"use client";

import { type CursorPages, useCursorPages } from "#/shared/lib/pagination/index.ts";

/** Rows per page of the version and activation tables (like the traces list). */
export const PROMPT_ROWS_PER_PAGE = 20;

const NOTHING_MORE = (): Promise<void> => Promise.resolve();

/**
 * Previous/next over a list the API answers whole (the append-only prompt versions and
 * activations): the same paging as a cursor list with every page already loaded.
 */
export const useLocalPages = <T>(rows: readonly T[], pageSize: number, label: string): CursorPages<T> =>
  useCursorPages({ data: rows, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: NOTHING_MORE }, pageSize, label);
