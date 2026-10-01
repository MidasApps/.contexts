"use client";

import { adminGetTraceEndpoint, adminListTracesEndpoint, type TraceDetail, type TraceSummary } from "@core/contracts";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const TRACES_PAGE_SIZE = 20;

/** Filters of the staff trace list; `page` is 1-based (the URL), the API pages from 0. */
export type AdminTraceFilters = {
  readonly page: number;
  readonly organizationId?: string | undefined;
  readonly agentId?: string | undefined;
  readonly status?: "ok" | "error" | undefined;
  /** ISO instants: traces that started in `[startedAfter, startedBefore)`. */
  readonly startedAfter?: string | undefined;
  readonly startedBefore?: string | undefined;
};

export type TracePage = { readonly data: readonly TraceSummary[]; readonly meta: { readonly hasMore: boolean } };

export const traceKeys = {
  all: (): QueryKey => ["admin", "traces"],
  list: (filters: AdminTraceFilters): QueryKey => ["admin", "traces", "list", filters],
  detail: (traceId: string): QueryKey => ["admin", "traces", "detail", traceId],
};

/** `GET /v1/admin/traces` (staff, platform.trace.read): one numbered page, newest first. */
export const adminTracesQuery = (callEndpoint: CallEndpoint, filters: AdminTraceFilters) =>
  queryOptions({
    queryKey: traceKeys.list(filters),
    queryFn: ({ signal }): Promise<TracePage> =>
      callEndpoint(adminListTracesEndpoint, {
        query: {
          page: filters.page - 1,
          perPage: TRACES_PAGE_SIZE,
          ...(filters.organizationId === undefined ? {} : { organizationId: filters.organizationId }),
          ...(filters.agentId === undefined ? {} : { agentId: filters.agentId }),
          ...(filters.status === undefined ? {} : { status: filters.status }),
          ...(filters.startedAfter === undefined ? {} : { startedAfter: filters.startedAfter }),
          ...(filters.startedBefore === undefined ? {} : { startedBefore: filters.startedBefore }),
        },
        signal,
      }),
  });

/** A page of traces; the previous page stays on screen while the next one loads. */
export const useAdminTraces = (filters: AdminTraceFilters, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...adminTracesQuery(callEndpoint, filters), placeholderData: keepPreviousData, enabled: signedIn && options.enabled !== false });
};

/** `GET /v1/admin/traces/{traceId}` (staff): the trace with its spans. */
export const adminTraceQuery = (callEndpoint: CallEndpoint, traceId: string) =>
  queryOptions({
    queryKey: traceKeys.detail(traceId),
    queryFn: async ({ signal }): Promise<TraceDetail> => (await callEndpoint(adminGetTraceEndpoint, { params: { traceId }, signal })).data,
  });

export const useAdminTrace = (traceId: string, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...adminTraceQuery(callEndpoint, traceId), enabled: signedIn && traceId !== "" && options.enabled !== false });
};
