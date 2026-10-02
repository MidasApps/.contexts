export type DataTableStatus =
  | { kind: "ready" }
  | { kind: "loading" }
  | {
      kind: "error";
      /** The failure of the list query (an `ApiError` or anything thrown): its code picks the copy, 403 the no-access state. */
      error: unknown;
      onRetry?: (() => void) | undefined;
      /** The retry is in flight (the query's `isFetching`). */
      retrying?: boolean | undefined;
    };

/** The part of a TanStack Query result the table status needs (every list hook fits it). */
export type DataTableQuery = {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly isFetching: boolean;
  readonly error: unknown;
  readonly refetch: () => unknown;
};

/**
 * The `DataTable` status of a list query: skeleton while the first page loads, the error with a
 * retry (pending while it refetches), else ready.
 * @example <DataTable status={dataTableStatusOf(members)} … />
 */
export const dataTableStatusOf = (query: DataTableQuery): DataTableStatus => {
  if (query.isPending) return { kind: "loading" };
  if (query.isError) return { kind: "error", error: query.error, onRetry: () => void query.refetch(), retrying: query.isFetching };
  return { kind: "ready" };
};
