"use client";

import { adminListConnectorsEndpoint, type Connector } from "@core/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { cursorListQuery, pageQuery } from "#/shared/api/cursor-list.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const ADMIN_CONNECTORS_PAGE_LIMIT = 20;

export const connectorKeys = {
  adminList: (organizationId: string): QueryKey => ["admin", "connectors", organizationId],
};

/**
 * `GET /v1/admin/connectors?organizationId=` (staff, platform.connector.read): the connectors of
 * one organization, never their secrets. The endpoint answers 400 without an organization.
 */
export const adminConnectorsQuery = (callEndpoint: CallEndpoint, organizationId: string) =>
  cursorListQuery<Connector>({
    queryKey: connectorKeys.adminList(organizationId),
    fetchPage: async (cursor, signal) =>
      callEndpoint(adminListConnectorsEndpoint, {
        query: { ...pageQuery(cursor, ADMIN_CONNECTORS_PAGE_LIMIT), organizationId },
        signal,
      }),
  });

export const useAdminConnectors = (organizationId: string | undefined, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useInfiniteQuery({
    ...adminConnectorsQuery(callEndpoint, organizationId ?? ""),
    enabled: signedIn && organizationId !== undefined && options.enabled !== false,
  });
};
