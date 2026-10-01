"use client";

import { listConnectorsEndpoint, type Connector } from "@core/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { cursorListQuery, pageQuery } from "#/shared/api/cursor-list.ts";
import { queryKeys, type QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const TENANT_CONNECTORS_PAGE_LIMIT = 20;

/** Under `["organizations", id]`: one organization's connectors never show in another's cache. */
export const tenantConnectorKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "connectors"),
};

/**
 * `GET /v1/organizations/{organizationId}/connectors` (core.connector.read): the organization's
 * own connectors, newest first. Secrets are never part of the answer, only `secretRef`.
 */
export const tenantConnectorsQuery = (callEndpoint: CallEndpoint, organizationId: string) =>
  cursorListQuery<Connector>({
    queryKey: tenantConnectorKeys.all(organizationId),
    fetchPage: async (cursor, signal) =>
      callEndpoint(listConnectorsEndpoint, { params: { organizationId }, query: pageQuery(cursor, TENANT_CONNECTORS_PAGE_LIMIT), signal }),
  });

export const useTenantConnectors = (organizationId: string, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useInfiniteQuery({ ...tenantConnectorsQuery(callEndpoint, organizationId), enabled: signedIn && organizationId !== "" && options.enabled !== false });
};
