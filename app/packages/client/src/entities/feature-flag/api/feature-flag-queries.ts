"use client";

import { adminListFlagsEndpoint, type FeatureFlag } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Platform flag data lives under `["admin", "flags"]`; a staff write invalidates `all`. */
export const featureFlagKeys = {
  all: (): QueryKey => ["admin", "flags"],
  list: (organizationId: string | undefined): QueryKey => ["admin", "flags", "list", organizationId ?? null],
};

/**
 * `GET /v1/admin/flags` (staff, platform.flag.manage): every registry flag. Without an
 * organization, `value` is the environment value; with one, `value` is what that organization
 * gets and `tenantOverride` its own override.
 */
export const adminFlagsQuery = (callEndpoint: CallEndpoint, organizationId?: string) =>
  queryOptions({
    queryKey: featureFlagKeys.list(organizationId),
    queryFn: async ({ signal }): Promise<FeatureFlag[]> =>
      (await callEndpoint(adminListFlagsEndpoint, { query: organizationId === undefined ? {} : { organizationId }, signal })).data,
  });

export const useAdminFlags = (organizationId?: string, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...adminFlagsQuery(callEndpoint, organizationId), enabled: signedIn && options.enabled !== false });
};
