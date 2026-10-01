"use client";

import { listMembersEndpoint, listMembershipsEndpoint } from "@core/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { cursorListQuery, pageQuery } from "#/shared/api/cursor-list.ts";
import { queryKeys, type QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Page size of member tables (SP2 spec §8). */
export const MEMBERS_PAGE_LIMIT = 50;

/** Member and membership keys under the organization; member mutations invalidate `all`. */
export const memberKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "members"),
  list: (organizationId: string, limit: number): QueryKey => queryKeys.organizationScoped(organizationId, "members", "list", { limit }),
  memberships: (organizationId: string, query: { principalId?: string | undefined; limit: number }): QueryKey =>
    queryKeys.organizationScoped(organizationId, "members", "memberships", { principalId: query.principalId ?? null, limit: query.limit }),
};

/** `GET /v1/organizations/{id}/members` (users with their grants), merged pages. */
export const membersQuery = (callEndpoint: CallEndpoint, organizationId: string, limit = MEMBERS_PAGE_LIMIT) =>
  cursorListQuery({
    queryKey: memberKeys.list(organizationId, limit),
    fetchPage: async (cursor, signal) => callEndpoint(listMembersEndpoint, { params: { organizationId }, query: pageQuery(cursor, limit), signal }),
  });

/** `GET /v1/organizations/{id}/memberships` (grants, optionally of one principal), merged pages. */
export const membershipsQuery = (callEndpoint: CallEndpoint, organizationId: string, query: { principalId?: string | undefined; limit?: number } = {}) => {
  const limit = query.limit ?? MEMBERS_PAGE_LIMIT;
  return cursorListQuery({
    queryKey: memberKeys.memberships(organizationId, { principalId: query.principalId, limit }),
    fetchPage: async (cursor, signal) =>
      callEndpoint(listMembershipsEndpoint, {
        params: { organizationId },
        query: { ...pageQuery(cursor, limit), ...(query.principalId === undefined ? {} : { principalId: query.principalId }) },
        signal,
      }),
  });
};

const useOrganizationEnabled = (organizationId: string | undefined): boolean => {
  const signedIn = useIsSignedIn();
  return signedIn && organizationId !== undefined && organizationId !== "";
};

/** Members of the organization (core.member.read); `fetchNextPage` loads more. */
export const useMembers = (organizationId: string | undefined) => {
  const callEndpoint = useCallEndpoint();
  const enabled = useOrganizationEnabled(organizationId);
  return useInfiniteQuery({ ...membersQuery(callEndpoint, organizationId ?? ""), enabled });
};

/** Grants of the organization, optionally of one principal. */
export const useMemberships = (organizationId: string | undefined, query: { principalId?: string | undefined } = {}) => {
  const callEndpoint = useCallEndpoint();
  const enabled = useOrganizationEnabled(organizationId);
  return useInfiniteQuery({ ...membershipsQuery(callEndpoint, organizationId ?? "", query), enabled });
};
