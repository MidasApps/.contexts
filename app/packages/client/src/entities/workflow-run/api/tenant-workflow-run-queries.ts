"use client";

import {
  getWorkflowRunEndpoint,
  listWorkflowCatalogEndpoint,
  listWorkflowRunsEndpoint,
  type WorkflowCatalogEntry,
  type WorkflowRun,
  type WorkflowRunStatus,
} from "@core/contracts";
import { queryOptions, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { cursorListQuery, nullOnNotFound, pageQuery } from "#/shared/api/cursor-list.ts";
import { pollWhileAnyLive } from "#/shared/api/live-list-polling.ts";
import { type QueryKey, queryKeys } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";
import { isRunCancelable } from "./workflow-run-queries.ts";

export const TENANT_RUNS_PAGE_LIMIT = 20;
/** How often a run page re-reads a run that can still change. */
export const RUN_POLL_MS = 2000;

/** Filters of an organization's run list (each one narrows on the server). */
export type TenantRunFilters = {
  readonly workflowId?: string | undefined;
  readonly status?: WorkflowRunStatus | undefined;
};

/** Under `["organizations", id]`: leaving or switching the organization drops its runs. */
export const tenantWorkflowRunKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "workflow-runs"),
  list: (organizationId: string, filters: TenantRunFilters): QueryKey =>
    queryKeys.organizationScoped(organizationId, "workflow-runs", "list", {
      workflowId: filters.workflowId ?? null,
      status: filters.status ?? null,
    }),
  one: (organizationId: string, runId: string): QueryKey =>
    queryKeys.organizationScoped(organizationId, "workflow-runs", "one", runId),
  catalog: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "workflow-catalog"),
};

/** `GET /v1/workflows/runs?organizationId=` (core.workflow-run.read): cursor pages, newest first. */
export const tenantWorkflowRunsQuery = (
  callEndpoint: CallEndpoint,
  organizationId: string,
  filters: TenantRunFilters,
) =>
  cursorListQuery<WorkflowRun>({
    queryKey: tenantWorkflowRunKeys.list(organizationId, filters),
    fetchPage: async (cursor, signal) =>
      callEndpoint(listWorkflowRunsEndpoint, {
        query: {
          ...pageQuery(cursor, TENANT_RUNS_PAGE_LIMIT),
          organizationId,
          ...(filters.workflowId === undefined ? {} : { workflowId: filters.workflowId }),
          ...(filters.status === undefined ? {} : { status: filters.status }),
        },
        signal,
      }),
  });

const pollTenantRuns = pollWhileAnyLive<WorkflowRun>((run) => isRunCancelable(run.status));

/** Re-read while a listed run can still change (after "Run now" or a start, the list follows it). */
export const useTenantWorkflowRuns = (
  organizationId: string,
  filters: TenantRunFilters,
  options: { enabled?: boolean } = {},
) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useInfiniteQuery({
    ...tenantWorkflowRunsQuery(callEndpoint, organizationId, filters),
    enabled: signedIn && organizationId !== "" && options.enabled !== false,
    refetchInterval: (query) => pollTenantRuns(query.state.data),
  });
};

/**
 * `GET /v1/workflows/runs/{runId}?organizationId=` (core.workflow-run.read). `null` when the run
 * does not exist or belongs to another organization (404): pages show not-found, not a retry.
 */
export const tenantWorkflowRunQuery = (callEndpoint: CallEndpoint, organizationId: string, runId: string) =>
  queryOptions({
    queryKey: tenantWorkflowRunKeys.one(organizationId, runId),
    queryFn: async ({ signal }): Promise<WorkflowRun | null> =>
      nullOnNotFound(
        async () =>
          (await callEndpoint(getWorkflowRunEndpoint, { params: { runId }, query: { organizationId }, signal })).data,
      ),
  });

/** One run; re-read every 2 s while it can still change (progress without a reload). */
export const useTenantWorkflowRun = (organizationId: string, runId: string, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({
    ...tenantWorkflowRunQuery(callEndpoint, organizationId, runId),
    enabled: signedIn && organizationId !== "" && runId !== "" && options.enabled !== false,
    refetchInterval: (query) =>
      query.state.data !== undefined && query.state.data !== null && isRunCancelable(query.state.data.status)
        ? RUN_POLL_MS
        : false,
  });
};

/** `GET /v1/workflows?organizationId=` (core.workflow-run.read): what the organization may start or schedule. */
export const workflowCatalogQuery = (callEndpoint: CallEndpoint, organizationId: string) =>
  queryOptions({
    queryKey: tenantWorkflowRunKeys.catalog(organizationId),
    queryFn: async ({ signal }): Promise<WorkflowCatalogEntry[]> =>
      (await callEndpoint(listWorkflowCatalogEndpoint, { query: { organizationId }, signal })).data,
  });

export const useWorkflowCatalog = (organizationId: string, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({
    ...workflowCatalogQuery(callEndpoint, organizationId),
    enabled: signedIn && organizationId !== "" && options.enabled !== false,
  });
};
