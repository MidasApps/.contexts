"use client";

import { type FeatureFlag, listFlagsEndpoint } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { type QueryKey, queryKeys } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const tenantFlagKeys = {
  list: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "flags"),
};

/**
 * `GET /v1/flags?organizationId=` (core.flag.read): only the flags an organization may override.
 * `value` is what the organization gets; `tenantOverride` is its own override, `null` when none.
 */
export const tenantFlagsQuery = (callEndpoint: CallEndpoint, organizationId: string) =>
  queryOptions({
    queryKey: tenantFlagKeys.list(organizationId),
    queryFn: async ({ signal }): Promise<FeatureFlag[]> =>
      (await callEndpoint(listFlagsEndpoint, { query: { organizationId }, signal })).data,
  });

export const useTenantFlags = (organizationId: string, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({
    ...tenantFlagsQuery(callEndpoint, organizationId),
    enabled: signedIn && organizationId !== "" && options.enabled !== false,
  });
};
