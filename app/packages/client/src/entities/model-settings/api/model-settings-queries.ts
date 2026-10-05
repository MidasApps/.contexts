"use client";

import { adminGetModelSettingsEndpoint, type ModelSettings } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const modelSettingsKeys = { all: (): QueryKey => ["admin", "models"] };

/** `GET /v1/admin/models` (staff, platform.model.manage): the model of each role and the model prices. */
export const modelSettingsQuery = (callEndpoint: CallEndpoint) =>
  queryOptions({
    queryKey: modelSettingsKeys.all(),
    queryFn: async ({ signal }): Promise<ModelSettings> =>
      (await callEndpoint(adminGetModelSettingsEndpoint, { signal })).data,
  });

export const useModelSettings = (options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...modelSettingsQuery(callEndpoint), enabled: signedIn && options.enabled !== false });
};
