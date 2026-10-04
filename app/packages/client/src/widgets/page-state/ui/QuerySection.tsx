"use client";

import type { ReactNode } from "react";
import { isApiErrorStatus } from "#/shared/api/cursor-list.ts";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { NoAccessState } from "#/shared/ui/molecules/NoAccessState/NoAccessState.tsx";
import type { PageQuery } from "./QueryPage.tsx";

export type QuerySectionProps<T> = {
  query: PageQuery<T>;
  loadingLabel: string;
  loading?: ReactNode;
  /**
   * Detail pages under a section (a run, a request): what a 404 or `null` data (a 404-to-null
   * read) renders, e.g. an `EmptyState` with a way back. Without it, both read as an error.
   */
  notFound?: ReactNode;
  children: (data: NonNullable<T>) => ReactNode;
};

/**
 * `QueryPage` for content under a page header that already has the `h1` (settings, profile):
 * skeleton, no-access for 403, `notFound` for 404 when given, an error with reference and retry
 * otherwise (not-found reads as an error by default: the page itself exists), else the content.
 */
export function QuerySection<T>({ query, loadingLabel, loading, notFound, children }: QuerySectionProps<T>) {
  if (query.status === "pending") return loading ?? <LoadingState label={loadingLabel} rows={4} />;
  const retry = () => void query.refetch();
  if (query.status === "error") {
    if (isApiErrorStatus(query.error, 403)) return <NoAccessState />;
    if (notFound !== undefined && isApiErrorStatus(query.error, 404)) return notFound;
    return <ApiErrorState error={query.error} onRetry={retry} retrying={query.isFetching} />;
  }
  if (query.data === undefined || query.data === null)
    return notFound ?? <ApiErrorState error={query.error} onRetry={retry} retrying={query.isFetching} />;
  return children(query.data);
}
