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
  children: (data: NonNullable<T>) => ReactNode;
};

/**
 * `QueryPage` for content under a page header that already has the `h1` (settings, profile):
 * skeleton, no-access for 403, an error with reference and retry (not-found reads as an error
 * here: the page itself exists), else the content.
 */
export function QuerySection<T>({ query, loadingLabel, loading, children }: QuerySectionProps<T>) {
  if (query.status === "pending") return loading ?? <LoadingState label={loadingLabel} rows={4} />;
  if (query.status === "error") {
    if (isApiErrorStatus(query.error, 403)) return <NoAccessState />;
    return <ApiErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  if (query.data === undefined || query.data === null) return <ApiErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  return children(query.data);
}
