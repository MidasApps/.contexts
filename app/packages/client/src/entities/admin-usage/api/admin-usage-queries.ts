"use client";

import { type AdminUsage, getAdminUsageEndpoint } from "@core/contracts";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** UTC days (`2026-09-30`); absent bounds let the API use the month to date. */
export type AdminUsageFilters = {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly organizationId?: string | undefined;
};

export const adminUsageKeys = {
  all: (): QueryKey => ["admin", "usage"],
  range: (filters: AdminUsageFilters): QueryKey => [
    "admin",
    "usage",
    filters.organizationId ?? null,
    filters.from ?? null,
    filters.to ?? null,
  ],
};

/**
 * `GET /v1/admin/usage` (staff, platform.usage.read; decision 0044): usage and cost by UTC day and
 * by model, of every live organization or of one.
 */
export const adminUsageQuery = (callEndpoint: CallEndpoint, filters: AdminUsageFilters) =>
  queryOptions({
    queryKey: adminUsageKeys.range(filters),
    queryFn: async ({ signal }): Promise<AdminUsage> =>
      (
        await callEndpoint(getAdminUsageEndpoint, {
          query: {
            ...(filters.from === undefined ? {} : { from: filters.from }),
            ...(filters.to === undefined ? {} : { to: filters.to }),
            ...(filters.organizationId === undefined ? {} : { organizationId: filters.organizationId }),
          },
          signal,
        })
      ).data,
  });

/** The usage of a range; the previous range stays on screen while the next one loads. */
export const useAdminUsage = (filters: AdminUsageFilters, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({
    ...adminUsageQuery(callEndpoint, filters),
    placeholderData: keepPreviousData,
    enabled: signedIn && options.enabled !== false,
  });
};
