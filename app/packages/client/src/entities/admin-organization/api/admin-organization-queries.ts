"use client";

import { listOrganizationsAdminEndpoint, type OrganizationAdminSummary } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { COLLECT_PAGE_LIMIT, collectAllPages, pageQuery } from "#/shared/api/cursor-list.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Platform data lives under `["admin", …]`: staff mutations invalidate `all`. */
export const adminOrganizationKeys = {
  all: (): QueryKey => ["admin", "organizations"],
  whole: (): QueryKey => ["admin", "organizations", "whole"],
};

/**
 * Every organization with plan, budget and cost month to date (`GET /v1/admin/organizations`,
 * staff, platform.organization.read). The endpoint pages by cursor and has no search, so the
 * console reads the cursor pages in order (bounded by `collectAllPages`: 20 pages of 100) and
 * filters, sorts and pages the result on the client.
 */
export const allAdminOrganizationsQuery = (callEndpoint: CallEndpoint) =>
  queryOptions({
    queryKey: adminOrganizationKeys.whole(),
    queryFn: ({ signal }): Promise<OrganizationAdminSummary[]> =>
      collectAllPages<OrganizationAdminSummary>(
        (cursor, pageSignal) => callEndpoint(listOrganizationsAdminEndpoint, { query: pageQuery(cursor, COLLECT_PAGE_LIMIT), signal: pageSignal }),
        signal,
      ),
  });

export const useAllAdminOrganizations = (options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...allAdminOrganizationsQuery(callEndpoint), enabled: signedIn && options.enabled !== false });
};
