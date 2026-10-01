"use client";

import type { ReactNode } from "react";
import { isApiErrorStatus } from "#/shared/api/cursor-list.ts";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { PageError, PageForbidden, PageNotFound } from "./PageState.tsx";

/** The parts of a TanStack query a page decides on. */
export type PageQuery<T> = {
  readonly status: "pending" | "error" | "success";
  readonly data: T | undefined;
  readonly error: unknown;
  readonly isFetching: boolean;
  readonly refetch: () => unknown;
};

export type QueryPageProps<T> = {
  query: PageQuery<T>;
  /** Accessible loading label (what the page is loading). */
  loadingLabel: string;
  /** Page skeleton; defaults to a generic `LoadingState`. */
  loading?: ReactNode;
  /** The page once the data is there (`null` data from a 404-to-null read renders not-found). */
  children: (data: NonNullable<T>) => ReactNode;
};

/**
 * One decision for every page's main query (SP2 spec §4, §9): skeleton while loading, not-found for
 * 404 or `null`, forbidden for 403, an error with reference and retry otherwise, else the page.
 */
export function QueryPage<T>({ query, loadingLabel, loading, children }: QueryPageProps<T>) {
  if (query.status === "pending") return loading ?? <LoadingState label={loadingLabel} rows={5} />;
  if (query.status === "error") {
    if (isApiErrorStatus(query.error, 404)) return <PageNotFound />;
    if (isApiErrorStatus(query.error, 403)) return <PageForbidden />;
    return <PageError error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  if (query.data === undefined || query.data === null) return <PageNotFound />;
  return children(query.data);
}
