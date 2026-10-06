"use client";

import { listApiKeysEndpoint } from "@core/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { cursorListQuery, pageQuery } from "#/shared/api/cursor-list.ts";
import { type QueryKey, queryKeys } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const API_KEYS_PAGE_LIMIT = 50;

/** API key keys under the organization; create/revoke invalidate `all`. */
export const apiKeyKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "api-keys"),
  list: (organizationId: string, limit: number): QueryKey =>
    queryKeys.organizationScoped(organizationId, "api-keys", "list", { limit }),
};

/** `GET /v1/organizations/{id}/api-keys` (never secrets), merged pages. */
export const apiKeysQuery = (callEndpoint: CallEndpoint, organizationId: string, limit = API_KEYS_PAGE_LIMIT) =>
  cursorListQuery({
    queryKey: apiKeyKeys.list(organizationId, limit),
    fetchPage: async (cursor, signal) =>
      callEndpoint(listApiKeysEndpoint, { params: { organizationId }, query: pageQuery(cursor, limit), signal }),
  });

/** API keys of the organization (core.api-key.read); `fetchNextPage` loads more. */
export const useApiKeys = (organizationId: string | undefined) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useInfiniteQuery({
    ...apiKeysQuery(callEndpoint, organizationId ?? ""),
    enabled: signedIn && organizationId !== undefined && organizationId !== "",
  });
};
