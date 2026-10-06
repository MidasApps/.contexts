"use client";

import { type AdminOverview, getAdminOverviewEndpoint } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const adminOverviewKeys = { all: (): QueryKey => ["admin", "overview"] };

/** `GET /v1/admin/overview` (staff, platform.usage.read). */
export const adminOverviewQuery = (callEndpoint: CallEndpoint) =>
  queryOptions({
    queryKey: adminOverviewKeys.all(),
    queryFn: async ({ signal }): Promise<AdminOverview> =>
      (await callEndpoint(getAdminOverviewEndpoint, { signal })).data,
  });

export const useAdminOverview = (options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...adminOverviewQuery(callEndpoint), enabled: signedIn && options.enabled !== false });
};
