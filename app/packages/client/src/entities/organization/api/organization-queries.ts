"use client";

import { getOrganizationEndpoint, type Organization } from "@core/contracts";
import { queryOptions, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { nullOnNotFound } from "#/shared/api/cursor-list.ts";
import { type QueryKey, queryKeys } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Query keys of the organization resource (under the organization, so a switch invalidates it). */
export const organizationKeys = {
  detail: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "detail"),
};

/** `GET /v1/organizations/{id}`; `null` when the organization is not visible (404). */
export const organizationQuery = (callEndpoint: CallEndpoint, organizationId: string) =>
  queryOptions({
    queryKey: organizationKeys.detail(organizationId),
    queryFn: ({ signal }): Promise<Organization | null> =>
      nullOnNotFound(
        async () => (await callEndpoint(getOrganizationEndpoint, { params: { organizationId }, signal })).data,
      ),
  });

/** The organization by id (`data === null`: not visible, render not-found). Disabled without an id. */
export const useOrganization = (organizationId: string | undefined): UseQueryResult<Organization | null> => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({
    ...organizationQuery(callEndpoint, organizationId ?? ""),
    enabled: signedIn && organizationId !== undefined && organizationId !== "",
  });
};
