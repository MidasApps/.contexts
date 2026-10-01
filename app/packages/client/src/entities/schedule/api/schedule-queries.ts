"use client";

import { adminListSchedulesEndpoint, type AdminSchedule } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const scheduleKeys = {
  all: (): QueryKey => ["admin", "schedules"],
  list: (organizationId: string | undefined): QueryKey => ["admin", "schedules", "list", organizationId ?? null],
};

/**
 * `GET /v1/admin/schedules` (staff, platform.workflow.manage): tenant schedules and, when no
 * organization is asked, the platform ones too.
 */
export const adminSchedulesQuery = (callEndpoint: CallEndpoint, organizationId: string | undefined) =>
  queryOptions({
    queryKey: scheduleKeys.list(organizationId),
    queryFn: async ({ signal }): Promise<AdminSchedule[]> =>
      (await callEndpoint(adminListSchedulesEndpoint, { query: organizationId === undefined ? {} : { organizationId }, signal })).data,
  });

export const useAdminSchedules = (organizationId: string | undefined, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...adminSchedulesQuery(callEndpoint, organizationId), enabled: signedIn && options.enabled !== false });
};
