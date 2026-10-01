"use client";

import { listPlansEndpoint, type Plan } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const planKeys = { all: (): QueryKey => ["admin", "plans"] };

/** `GET /v1/admin/plans` (staff, platform.plan.manage): the whole catalog, it is short. */
export const plansQuery = (callEndpoint: CallEndpoint) =>
  queryOptions({ queryKey: planKeys.all(), queryFn: async ({ signal }): Promise<Plan[]> => (await callEndpoint(listPlansEndpoint, { signal })).data });

export const usePlans = (options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...plansQuery(callEndpoint), enabled: signedIn && options.enabled !== false });
};
