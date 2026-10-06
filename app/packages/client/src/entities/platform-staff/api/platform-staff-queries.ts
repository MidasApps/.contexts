"use client";

import { adminListStaffEndpoint, type PlatformStaff } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** The staff list lives under `["admin", "staff"]`; every staff change invalidates it. */
export const platformStaffKeys = { all: (): QueryKey => ["admin", "staff"] };

/** `GET /v1/admin/staff` (platform.staff.manage): every staff record, active and revoked. */
export const platformStaffQuery = (callEndpoint: CallEndpoint) =>
  queryOptions({
    queryKey: platformStaffKeys.all(),
    queryFn: async ({ signal }): Promise<PlatformStaff[]> =>
      (await callEndpoint(adminListStaffEndpoint, { signal })).data,
  });

/** The platform staff; `enabled: false` until the viewer is known to hold platform.staff.manage. */
export const usePlatformStaff = (options: { enabled: boolean }) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...platformStaffQuery(callEndpoint), enabled: signedIn && options.enabled });
};
