"use client";

import type { EvalExperimentSummary } from "@core/contracts";
import { type UseQueryOptions, useQueries } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";
import { adminExperimentQuery } from "../api/eval-queries.ts";
import { tenantExperimentQuery } from "../api/tenant-eval-queries.ts";

/** What one chosen experiment resolved to: found (on the page or by id), still loading, gone, or failed. */
export type ChosenExperiment =
  | { readonly kind: "found"; readonly experiment: EvalExperimentSummary }
  | { readonly kind: "pending" }
  | { readonly kind: "missing" }
  | { readonly kind: "error"; readonly error: unknown };

/**
 * The comparison state of the chosen experiments (A then B): `idle` with none, `one` with A only,
 * `ready` with both. `missing` wins over `error`, `error` over `pending`, so the view always says
 * the most actionable thing.
 */
export type ExperimentPair =
  | { readonly status: "idle" }
  | { readonly status: "one"; readonly a: EvalExperimentSummary }
  | { readonly status: "ready"; readonly a: EvalExperimentSummary; readonly b: EvalExperimentSummary }
  | { readonly status: "pending" }
  | { readonly status: "missing" }
  | { readonly status: "error"; readonly error: unknown };

export const resolveExperimentPair = (chosen: readonly ChosenExperiment[]): ExperimentPair => {
  if (chosen.some((one) => one.kind === "missing")) return { status: "missing" };
  const failed = chosen.find((one) => one.kind === "error");
  if (failed !== undefined) return { status: "error", error: failed.error };
  const found = chosen.flatMap((one) => (one.kind === "found" ? [one.experiment] : []));
  if (found.length < chosen.length) return { status: "pending" };
  const [a, b] = found;
  if (a === undefined) return { status: "idle" };
  return b === undefined ? { status: "one", a } : { status: "ready", a, b };
};

export type ExperimentPairState = ExperimentPair & {
  /** Reads again the chosen experiments that failed. */
  readonly retry: () => void;
  readonly retrying: boolean;
};

type ReadOne = (callEndpoint: CallEndpoint, experimentId: string) => UseQueryOptions<EvalExperimentSummary | null>;

/**
 * Resolves the chosen ids: an experiment of the shown page is used as is; any other is read by id,
 * so a comparison can span list pages (decision 0049).
 */
const useExperimentPair = (
  ids: readonly string[],
  onPage: readonly EvalExperimentSummary[],
  readOne: ReadOne,
  enabled: boolean,
): ExperimentPairState => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  const known = ids.map((id) => onPage.find((experiment) => experiment.experimentId === id));
  const reads = useQueries({
    queries: ids.map((id, index) => ({
      ...readOne(callEndpoint, id),
      enabled: signedIn && enabled && known[index] === undefined,
    })),
  });
  const chosen = ids.map((_id, index): ChosenExperiment => {
    const page = known[index];
    if (page !== undefined) return { kind: "found", experiment: page };
    const read = reads[index];
    if (read === undefined || read.status === "pending") return { kind: "pending" };
    if (read.status === "error") return { kind: "error", error: read.error };
    return read.data === null ? { kind: "missing" } : { kind: "found", experiment: read.data };
  });
  return {
    ...resolveExperimentPair(chosen),
    retry: () => reads.forEach((read) => void (read.status === "error" ? read.refetch() : undefined)),
    retrying: reads.some((read) => read.isFetching),
  };
};

/** Staff comparison: experiments of any source and tenant. */
export const useAdminExperimentPair = (
  ids: readonly string[],
  onPage: readonly EvalExperimentSummary[],
): ExperimentPairState => useExperimentPair(ids, onPage, adminExperimentQuery, true);

/** An organization's comparison: its own experiments only. */
export const useTenantExperimentPair = (
  organizationId: string,
  ids: readonly string[],
  onPage: readonly EvalExperimentSummary[],
): ExperimentPairState =>
  useExperimentPair(
    ids,
    onPage,
    (callEndpoint, id) => tenantExperimentQuery(callEndpoint, organizationId, id),
    organizationId !== "",
  );
