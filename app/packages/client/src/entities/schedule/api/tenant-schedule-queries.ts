"use client";

import { getScheduleEndpoint, listSchedulesEndpoint, type Schedule } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { queryKeys, type QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Under `["organizations", id]`: leaving or switching the organization drops its schedules. */
export const tenantScheduleKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "schedules"),
  list: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "schedules", "list"),
  one: (organizationId: string, scheduleId: string): QueryKey => queryKeys.organizationScoped(organizationId, "schedules", "one", scheduleId),
};

/** `GET /v1/schedules?organizationId=` (core.schedule.read): the organization's schedules with their next fire. */
export const tenantSchedulesQuery = (callEndpoint: CallEndpoint, organizationId: string) =>
  queryOptions({
    queryKey: tenantScheduleKeys.list(organizationId),
    queryFn: async ({ signal }): Promise<Schedule[]> => (await callEndpoint(listSchedulesEndpoint, { query: { organizationId }, signal })).data,
  });

export const useTenantSchedules = (organizationId: string, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...tenantSchedulesQuery(callEndpoint, organizationId), enabled: signedIn && organizationId !== "" && options.enabled !== false });
};

/** `GET /v1/schedules/{scheduleId}?organizationId=` (core.schedule.read). */
export const tenantScheduleQuery = (callEndpoint: CallEndpoint, organizationId: string, scheduleId: string) =>
  queryOptions({
    queryKey: tenantScheduleKeys.one(organizationId, scheduleId),
    queryFn: async ({ signal }): Promise<Schedule> => (await callEndpoint(getScheduleEndpoint, { params: { scheduleId }, query: { organizationId }, signal })).data,
  });

export const useTenantSchedule = (organizationId: string, scheduleId: string | undefined) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...tenantScheduleQuery(callEndpoint, organizationId, scheduleId ?? ""), enabled: signedIn && organizationId !== "" && scheduleId !== undefined });
};
