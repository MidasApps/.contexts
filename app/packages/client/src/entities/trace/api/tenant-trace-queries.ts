"use client";

import { getTraceEndpoint, listTracesEndpoint, type TraceDetail } from "@core/contracts";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { type QueryKey, queryKeys } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";
import { TRACES_PAGE_SIZE, type TracePage } from "./trace-queries.ts";

/** Filters of an organization's trace list; `page` is 1-based (the UI), the API pages from 0. */
export type TenantTraceFilters = {
  readonly page: number;
  readonly agentId?: string | undefined;
  readonly status?: "ok" | "error" | undefined;
};

/** Under `["organizations", id, "traces"]`: one organization's traces never show in another. */
export const tenantTraceKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "traces"),
  list: (organizationId: string, filters: TenantTraceFilters): QueryKey =>
    queryKeys.organizationScoped(organizationId, "traces", "list", filters),
  detail: (organizationId: string, traceId: string): QueryKey =>
    queryKeys.organizationScoped(organizationId, "traces", "detail", traceId),
};

/** `GET /v1/traces?organizationId=` (core.trace.read): one numbered page, newest first; the server filters by tenant. */
export const tenantTracesQuery = (callEndpoint: CallEndpoint, organizationId: string, filters: TenantTraceFilters) =>
  queryOptions({
    queryKey: tenantTraceKeys.list(organizationId, filters),
    queryFn: ({ signal }): Promise<TracePage> =>
      callEndpoint(listTracesEndpoint, {
        query: {
          organizationId,
          page: filters.page - 1,
          perPage: TRACES_PAGE_SIZE,
          ...(filters.agentId === undefined ? {} : { agentId: filters.agentId }),
          ...(filters.status === undefined ? {} : { status: filters.status }),
        },
        signal,
      }),
  });

/** A page of the organization's traces; the previous page stays on screen while the next one loads. */
export const useTenantTraces = (
  organizationId: string,
  filters: TenantTraceFilters,
  options: { enabled?: boolean } = {},
) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({
    ...tenantTracesQuery(callEndpoint, organizationId, filters),
    placeholderData: keepPreviousData,
    enabled: signedIn && organizationId !== "" && options.enabled !== false,
  });
};

/** `GET /v1/traces/{traceId}?organizationId=` (core.trace.read): the trace with its spans; another tenant's trace answers 404. */
export const tenantTraceQuery = (callEndpoint: CallEndpoint, organizationId: string, traceId: string) =>
  queryOptions({
    queryKey: tenantTraceKeys.detail(organizationId, traceId),
    queryFn: async ({ signal }): Promise<TraceDetail> =>
      (await callEndpoint(getTraceEndpoint, { params: { traceId }, query: { organizationId }, signal })).data,
  });

export const useTenantTrace = (organizationId: string, traceId: string, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({
    ...tenantTraceQuery(callEndpoint, organizationId, traceId),
    enabled: signedIn && organizationId !== "" && traceId !== "" && options.enabled !== false,
  });
};
