"use client";

import { listDevicesEndpoint } from "@core/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { cursorListQuery, pageQuery } from "#/shared/api/cursor-list.ts";
import { type QueryKey, queryKeys } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const DEVICES_PAGE_LIMIT = 50;

/** Device keys under the organization; activation/revoke invalidate `all`. */
export const deviceKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "devices"),
  list: (organizationId: string, limit: number): QueryKey =>
    queryKeys.organizationScoped(organizationId, "devices", "list", { limit }),
};

/** `GET /v1/organizations/{id}/devices`, merged pages. */
export const devicesQuery = (callEndpoint: CallEndpoint, organizationId: string, limit = DEVICES_PAGE_LIMIT) =>
  cursorListQuery({
    queryKey: deviceKeys.list(organizationId, limit),
    fetchPage: async (cursor, signal) =>
      callEndpoint(listDevicesEndpoint, { params: { organizationId }, query: pageQuery(cursor, limit), signal }),
  });

/** Devices of the organization (core.device.read); `fetchNextPage` loads more. */
export const useDevices = (organizationId: string | undefined) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useInfiniteQuery({
    ...devicesQuery(callEndpoint, organizationId ?? ""),
    enabled: signedIn && organizationId !== undefined && organizationId !== "",
  });
};
