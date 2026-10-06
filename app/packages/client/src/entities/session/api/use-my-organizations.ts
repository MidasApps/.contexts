"use client";

import { listMyOrganizationsEndpoint } from "@core/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { COLLECT_PAGE_LIMIT, cursorListQuery, pageQuery } from "#/shared/api/cursor-list.ts";
import { queryKeys } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Organizations where the user holds any grant (`GET /v1/me/organizations`), 100 per page. */
export const myOrganizationsQuery = (callEndpoint: CallEndpoint, limit = COLLECT_PAGE_LIMIT) =>
  cursorListQuery({
    queryKey: queryKeys.myOrganizations({ limit }),
    fetchPage: async (cursor, signal) =>
      callEndpoint(listMyOrganizationsEndpoint, { query: pageQuery(cursor, limit), signal }),
  });

/**
 * The user's organizations as one merged list (`data`), with `fetchNextPage`/`hasNextPage` for more.
 * User-level data: keyed under `["me"]`, not under an organization.
 */
export const useMyOrganizations = () => {
  const callEndpoint = useCallEndpoint();
  return useInfiniteQuery({ ...myOrganizationsQuery(callEndpoint), enabled: useIsSignedIn() });
};
