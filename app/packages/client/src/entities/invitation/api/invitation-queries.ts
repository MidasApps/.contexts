"use client";

import { listInvitationsEndpoint, type InvitationStatus } from "@core/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { cursorListQuery, pageQuery } from "#/shared/api/cursor-list.ts";
import { queryKeys, type QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const INVITATIONS_PAGE_LIMIT = 50;

/** Invitation keys under the organization; invite/revoke invalidate `all`. */
export const invitationKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "invitations"),
  list: (organizationId: string, query: { status?: InvitationStatus | undefined; limit: number }): QueryKey =>
    queryKeys.organizationScoped(organizationId, "invitations", "list", { status: query.status ?? null, limit: query.limit }),
};

/** `GET /v1/organizations/{id}/invitations`, optionally by status, merged pages. */
export const invitationsQuery = (callEndpoint: CallEndpoint, organizationId: string, query: { status?: InvitationStatus | undefined; limit?: number } = {}) => {
  const limit = query.limit ?? INVITATIONS_PAGE_LIMIT;
  return cursorListQuery({
    queryKey: invitationKeys.list(organizationId, { status: query.status, limit }),
    fetchPage: async (cursor, signal) =>
      callEndpoint(listInvitationsEndpoint, {
        params: { organizationId },
        query: { ...pageQuery(cursor, limit), ...(query.status === undefined ? {} : { status: query.status }) },
        signal,
      }),
  });
};

/** Invitations of the organization (core.member.invite); `fetchNextPage` loads more. */
export const useInvitations = (organizationId: string | undefined, query: { status?: InvitationStatus | undefined } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useInfiniteQuery({ ...invitationsQuery(callEndpoint, organizationId ?? "", query), enabled: signedIn && organizationId !== undefined && organizationId !== "" });
};
