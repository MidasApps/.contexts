"use client";

import { getModuleSettingsEndpoint, type ModuleSettings } from "@core/contracts";
import { queryOptions, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { nullOnNotFound } from "#/shared/api/cursor-list.ts";
import { type QueryKey, queryKeys } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Module settings keys under the organization; the update feature writes `detail`. */
export const moduleSettingsKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "module-settings"),
  detail: (organizationId: string, moduleId: string): QueryKey =>
    queryKeys.organizationScoped(organizationId, "module-settings", moduleId),
};

/** `GET /v1/organizations/{id}/module-settings/{moduleId}`; `null` for an unknown module or hidden organization. */
export const moduleSettingsQuery = (callEndpoint: CallEndpoint, node: { organizationId: string; moduleId: string }) =>
  queryOptions({
    queryKey: moduleSettingsKeys.detail(node.organizationId, node.moduleId),
    queryFn: ({ signal }): Promise<ModuleSettings | null> =>
      nullOnNotFound(async () => (await callEndpoint(getModuleSettingsEndpoint, { params: node, signal })).data),
  });

/** Stored settings of a module (`values: null` until first saved). */
export const useModuleSettings = (
  organizationId: string | undefined,
  moduleId: string | undefined,
): UseQueryResult<ModuleSettings | null> => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  const enabled =
    signedIn && organizationId !== undefined && organizationId !== "" && moduleId !== undefined && moduleId !== "";
  return useQuery({
    ...moduleSettingsQuery(callEndpoint, { organizationId: organizationId ?? "", moduleId: moduleId ?? "" }),
    enabled,
  });
};
