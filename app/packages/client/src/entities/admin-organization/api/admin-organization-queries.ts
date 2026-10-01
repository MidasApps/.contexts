"use client";

import {
  getOrganizationAdminEndpoint,
  listOrganizationsAdminEndpoint,
  type OrganizationAdminDetail,
  type OrganizationAdminSummary,
  type OrganizationStatus,
} from "@core/contracts";
import { queryOptions, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { COLLECT_PAGE_LIMIT, collectAllPages, cursorListQuery, nullOnNotFound, pageQuery } from "#/shared/api/cursor-list.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const ADMIN_ORGANIZATIONS_PAGE_LIMIT = 20;

/** Text (words of the name or id) and status the list is narrowed by; both absent lists everything. */
export type AdminOrganizationFilter = { readonly query?: string | undefined; readonly status?: OrganizationStatus | undefined };

/** Platform data lives under `["admin", …]`: staff mutations invalidate `all`. */
export const adminOrganizationKeys = {
  all: (): QueryKey => ["admin", "organizations"],
  whole: (): QueryKey => ["admin", "organizations", "whole"],
  searches: (): QueryKey => ["admin", "organizations", "search"],
  search: (filter: AdminOrganizationFilter): QueryKey => ["admin", "organizations", "search", filter.status ?? "any", filter.query ?? ""],
  detail: (organizationId: string): QueryKey => ["admin", "organizations", "detail", organizationId],
};

/**
 * Every organization, for pickers (`AdminOrganizationFilter`) and pages that total the platform
 * (`GET /v1/admin/organizations`, staff, platform.organization.read): the cursor pages read in
 * order, bounded by `collectAllPages` (20 pages of 100). The organizations page itself searches on
 * the server (`adminOrganizationSearchQuery`).
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

/**
 * `GET /v1/admin/organizations?query=&status=` (decision 0044): the search and the status filter
 * run on the server, one cursor page at a time. A filtered page may hold fewer rows than asked
 * while more exist (the server reads a bounded number of organizations per call).
 */
export const adminOrganizationSearchQuery = (callEndpoint: CallEndpoint, filter: AdminOrganizationFilter) =>
  cursorListQuery<OrganizationAdminSummary>({
    queryKey: adminOrganizationKeys.search(filter),
    fetchPage: (cursor, signal) =>
      callEndpoint(listOrganizationsAdminEndpoint, {
        query: {
          ...pageQuery(cursor, ADMIN_ORGANIZATIONS_PAGE_LIMIT),
          ...(filter.query === undefined || filter.query === "" ? {} : { query: filter.query }),
          ...(filter.status === undefined ? {} : { status: filter.status }),
        },
        signal,
      }),
  });

export const useAdminOrganizationSearch = (filter: AdminOrganizationFilter, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useInfiniteQuery({ ...adminOrganizationSearchQuery(callEndpoint, filter), enabled: signedIn && options.enabled !== false });
};

/** `GET /v1/admin/organizations/{id}`: one organization with its member count; `null` when it is not found. */
export const adminOrganizationQuery = (callEndpoint: CallEndpoint, organizationId: string) =>
  queryOptions({
    queryKey: adminOrganizationKeys.detail(organizationId),
    queryFn: ({ signal }): Promise<OrganizationAdminDetail | null> =>
      nullOnNotFound(async () => (await callEndpoint(getOrganizationAdminEndpoint, { params: { organizationId }, signal })).data),
  });

export const useAdminOrganization = (organizationId: string, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...adminOrganizationQuery(callEndpoint, organizationId), enabled: signedIn && organizationId !== "" && options.enabled !== false });
};
