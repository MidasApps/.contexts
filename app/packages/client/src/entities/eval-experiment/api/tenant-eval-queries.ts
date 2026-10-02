"use client";

import { getEvalExperimentEndpoint, listEvalDatasetsEndpoint, listEvalExperimentsEndpoint, type EvalDataset, type EvalExperimentSummary } from "@core/contracts";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { nullOnNotFound } from "#/shared/api/cursor-list.ts";
import { queryKeys, type QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";
import { EXPERIMENTS_PAGE_SIZE, type ExperimentPage } from "./eval-queries.ts";

/** Under `["organizations", id, "evals"]`: one organization's datasets and experiments. */
export const tenantEvalKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "evals"),
  experiments: (organizationId: string, page: number): QueryKey => queryKeys.organizationScoped(organizationId, "evals", "experiments", { page }),
  experiment: (organizationId: string, experimentId: string): QueryKey => queryKeys.organizationScoped(organizationId, "evals", "experiment", experimentId),
  datasets: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "evals", "datasets"),
};

/** `GET /v1/evals/experiments?organizationId=` (core.eval.read); `page` is 1-based, the API pages from 0. */
export const tenantExperimentsQuery = (callEndpoint: CallEndpoint, organizationId: string, page: number) =>
  queryOptions({
    queryKey: tenantEvalKeys.experiments(organizationId, page),
    queryFn: ({ signal }): Promise<ExperimentPage> =>
      callEndpoint(listEvalExperimentsEndpoint, { query: { organizationId, page: page - 1, perPage: EXPERIMENTS_PAGE_SIZE }, signal }),
  });

export const useTenantExperiments = (organizationId: string, page: number, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({
    ...tenantExperimentsQuery(callEndpoint, organizationId, page),
    placeholderData: keepPreviousData,
    enabled: signedIn && organizationId !== "" && options.enabled !== false,
  });
};

/**
 * `GET /v1/evals/experiments/{id}?organizationId=` (core.eval.read): one of the organization's
 * experiments, `null` when it does not exist or belongs to another organization (decision 0049).
 */
export const tenantExperimentQuery = (callEndpoint: CallEndpoint, organizationId: string, experimentId: string) =>
  queryOptions({
    queryKey: tenantEvalKeys.experiment(organizationId, experimentId),
    queryFn: ({ signal }): Promise<EvalExperimentSummary | null> =>
      nullOnNotFound(async () => (await callEndpoint(getEvalExperimentEndpoint, { params: { experimentId }, query: { organizationId }, signal })).data),
  });

/** `GET /v1/evals/datasets?organizationId=` (core.eval.read): the organization's own datasets. */
export const tenantDatasetsQuery = (callEndpoint: CallEndpoint, organizationId: string) =>
  queryOptions({
    queryKey: tenantEvalKeys.datasets(organizationId),
    queryFn: async ({ signal }): Promise<EvalDataset[]> => (await callEndpoint(listEvalDatasetsEndpoint, { query: { organizationId }, signal })).data,
  });

export const useTenantDatasets = (organizationId: string, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...tenantDatasetsQuery(callEndpoint, organizationId), enabled: signedIn && organizationId !== "" && options.enabled !== false });
};
