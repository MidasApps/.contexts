"use client";

import { getUsageSummaryEndpoint, type UsageSummary } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { queryKeys, type QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Usage keys under the organization; a change of the caps invalidates `all` (the summary carries them). */
export const usageKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "usage"),
  summary: (organizationId: string, month: string | undefined): QueryKey => queryKeys.organizationScoped(organizationId, "usage", "summary", month ?? "current"),
};

/** `GET /v1/usage?organizationId=&month=` (core.usage.read): a month of model usage against the caps; the current UTC month by default. */
export const usageSummaryQuery = (callEndpoint: CallEndpoint, organizationId: string, month: string | undefined) =>
  queryOptions({
    queryKey: usageKeys.summary(organizationId, month),
    queryFn: async ({ signal }): Promise<UsageSummary> =>
      (await callEndpoint(getUsageSummaryEndpoint, { query: { organizationId, ...(month === undefined ? {} : { month }) }, signal })).data,
  });

export const useUsageSummary = (organizationId: string, month?: string, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...usageSummaryQuery(callEndpoint, organizationId, month), enabled: signedIn && organizationId !== "" && options.enabled !== false });
};
