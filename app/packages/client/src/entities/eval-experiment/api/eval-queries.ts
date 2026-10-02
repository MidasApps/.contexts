"use client";

import { adminGetExperimentEndpoint, adminListDatasetsEndpoint, adminListExperimentsEndpoint, type EvalDataset, type EvalExperimentSummary } from "@core/contracts";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { nullOnNotFound } from "#/shared/api/cursor-list.ts";
import type { QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const EXPERIMENTS_PAGE_SIZE = 20;

export type ExperimentPage = { readonly data: readonly EvalExperimentSummary[]; readonly meta: { readonly hasMore: boolean } };

export const evalKeys = {
  all: (): QueryKey => ["admin", "evals"],
  experiments: (page: number): QueryKey => ["admin", "evals", "experiments", { page }],
  experiment: (experimentId: string): QueryKey => ["admin", "evals", "experiment", experimentId],
  datasets: (): QueryKey => ["admin", "evals", "datasets"],
};

/** `GET /v1/admin/experiments` (staff, platform.eval.manage); `page` is 1-based, the API pages from 0. */
export const adminExperimentsQuery = (callEndpoint: CallEndpoint, page: number) =>
  queryOptions({
    queryKey: evalKeys.experiments(page),
    queryFn: ({ signal }): Promise<ExperimentPage> => callEndpoint(adminListExperimentsEndpoint, { query: { page: page - 1, perPage: EXPERIMENTS_PAGE_SIZE }, signal }),
  });

export const useAdminExperiments = (page: number, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...adminExperimentsQuery(callEndpoint, page), placeholderData: keepPreviousData, enabled: signedIn && options.enabled !== false });
};

/** `GET /v1/admin/experiments/{id}` (staff): any experiment, `null` when it does not exist (decision 0048). */
export const adminExperimentQuery = (callEndpoint: CallEndpoint, experimentId: string) =>
  queryOptions({
    queryKey: evalKeys.experiment(experimentId),
    queryFn: ({ signal }): Promise<EvalExperimentSummary | null> =>
      nullOnNotFound(async () => (await callEndpoint(adminGetExperimentEndpoint, { params: { experimentId }, signal })).data),
  });

/** `GET /v1/admin/datasets` (staff): platform and organization datasets. */
export const adminDatasetsQuery = (callEndpoint: CallEndpoint) =>
  queryOptions({
    queryKey: evalKeys.datasets(),
    queryFn: async ({ signal }): Promise<EvalDataset[]> => (await callEndpoint(adminListDatasetsEndpoint, { signal })).data,
  });

export const useAdminDatasets = (options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...adminDatasetsQuery(callEndpoint), enabled: signedIn && options.enabled !== false });
};
