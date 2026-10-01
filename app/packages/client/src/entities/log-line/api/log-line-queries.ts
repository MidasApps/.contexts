"use client";

import { adminListLogsEndpoint, type LogLine, type LogLineLevel } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const satisfies readonly LogLineLevel[];
export const LOG_LINES_LIMIT = 200;

export type LogFilters = {
  /** Minimum level. */
  readonly level?: LogLineLevel | undefined;
  readonly q?: string | undefined;
  readonly traceId?: string | undefined;
  readonly requestId?: string | undefined;
};

export const logLineKeys = {
  all: (): QueryKey => ["admin", "logs"],
  list: (filters: LogFilters): QueryKey => ["admin", "logs", filters],
};

const defined = (filters: LogFilters): Record<string, string> =>
  Object.fromEntries(Object.entries(filters).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== ""));

/**
 * `GET /v1/admin/logs` (staff, platform.trace.read): the latest lines of the web process, newest
 * first. Local environment only: anywhere else the endpoint answers 404 and the page points to
 * Cloud Logging. Never served from cache as fresh: every visit and every refresh reads the buffer.
 */
export const adminLogsQuery = (callEndpoint: CallEndpoint, filters: LogFilters) =>
  queryOptions({
    queryKey: logLineKeys.list(filters),
    queryFn: async ({ signal }): Promise<LogLine[]> =>
      (await callEndpoint(adminListLogsEndpoint, { query: { ...defined(filters), limit: LOG_LINES_LIMIT }, signal })).data,
    staleTime: 0,
  });

export const useAdminLogs = (filters: LogFilters, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...adminLogsQuery(callEndpoint, filters), enabled: signedIn && options.enabled !== false });
};
