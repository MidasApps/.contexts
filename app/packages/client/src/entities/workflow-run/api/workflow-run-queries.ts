"use client";

import { type AdminWorkflowRun, adminListWorkflowRunsEndpoint, type WorkflowRunStatus } from "@core/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { cursorListQuery, pageQuery } from "#/shared/api/cursor-list.ts";
import { pollWhileAnyLive } from "#/shared/api/live-list-polling.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const ADMIN_RUNS_PAGE_LIMIT = 20;

/** Filters of the staff run list (all optional; each one narrows on the server). */
export type AdminRunFilters = {
  readonly organizationId?: string | undefined;
  readonly workflowId?: string | undefined;
  readonly status?: WorkflowRunStatus | undefined;
};

export const workflowRunKeys = {
  all: (): QueryKey => ["admin", "workflow-runs"],
  list: (filters: AdminRunFilters): QueryKey => ["admin", "workflow-runs", "list", filters],
};

/** Statuses a run never leaves; anything else can still be cancelled. */
const TERMINAL: ReadonlySet<WorkflowRunStatus> = new Set(["success", "failed", "canceled", "tripwire"]);
export const isRunCancelable = (status: WorkflowRunStatus): boolean => !TERMINAL.has(status);

/** `GET /v1/admin/workflow-runs` (staff, platform.workflow.manage): cursor pages, newest first. */
export const adminWorkflowRunsQuery = (callEndpoint: CallEndpoint, filters: AdminRunFilters) =>
  cursorListQuery<AdminWorkflowRun>({
    queryKey: workflowRunKeys.list(filters),
    fetchPage: async (cursor, signal) =>
      callEndpoint(adminListWorkflowRunsEndpoint, {
        query: {
          ...pageQuery(cursor, ADMIN_RUNS_PAGE_LIMIT),
          ...(filters.organizationId === undefined ? {} : { organizationId: filters.organizationId }),
          ...(filters.workflowId === undefined ? {} : { workflowId: filters.workflowId }),
          ...(filters.status === undefined ? {} : { status: filters.status }),
        },
        signal,
      }),
  });

const pollAdminRuns = pollWhileAnyLive<AdminWorkflowRun>((run) => isRunCancelable(run.status));

/** Re-read while a listed run can still change, so "running" does not outlive the run. */
export const useAdminWorkflowRuns = (filters: AdminRunFilters, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useInfiniteQuery({
    ...adminWorkflowRunsQuery(callEndpoint, filters),
    enabled: signedIn && options.enabled !== false,
    refetchInterval: (query) => pollAdminRuns(query.state.data),
  });
};
