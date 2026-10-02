import type { EvalDataset, EvalExperimentSummary, TraceDetail, TraceSummary } from "@core/contracts";
import type { Result } from "../../../shared/result/result.ts";

/** A console call refused or failed upstream: the status and code `/v1` answers with. */
export type ConsoleError = { readonly code: string; readonly status: number };

export type ConsoleResult<T> = Result<T, ConsoleError>;

/** `null` tenant = staff: every tenant. A tenant endpoint always passes its organization. */
export type TenantFilter = { readonly tenantId: string | null };
export type PageNumber = { readonly page: number; readonly perPage: number };
/** ISO instants: traces that started in `[startedAfter, startedBefore)`. */
export type TraceTimeRange = { readonly startedAfter?: string; readonly startedBefore?: string };

/**
 * The runtime's console routes (decision 0040): traces, experiments and datasets read from Mastra
 * storage, filtered by tenant there. `/v1` authorizes first and never lets a tenant endpoint pass a
 * tenant other than the caller's organization.
 */
export type ConsoleGateway = {
  readonly listTraces: (query: TenantFilter & PageNumber & TraceTimeRange & { readonly agentId?: string; readonly status?: "ok" | "error" }) => Promise<ConsoleResult<{ readonly traces: TraceSummary[]; readonly hasMore: boolean }>>;
  readonly getTrace: (query: TenantFilter & { readonly traceId: string }) => Promise<ConsoleResult<TraceDetail>>;
  readonly listExperiments: (query: TenantFilter & PageNumber) => Promise<ConsoleResult<{ readonly experiments: EvalExperimentSummary[]; readonly hasMore: boolean }>>;
  /** One experiment; another tenant's is `NOT_FOUND` like a missing one. */
  readonly getExperiment: (query: TenantFilter & { readonly experimentId: string }) => Promise<ConsoleResult<EvalExperimentSummary>>;
  readonly listDatasets: (query: TenantFilter) => Promise<ConsoleResult<EvalDataset[]>>;
  readonly startExperiment: (input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly datasetId: string;
    readonly agentId: string;
    readonly requestId: string;
  }) => Promise<ConsoleResult<{ readonly experimentId: string }>>;
  readonly addFeedbackItem: (input: {
    readonly tenantId: string;
    readonly feedbackKey: string;
    readonly conversationId: string;
    readonly messageId: string;
    readonly rating: "up" | "down";
    readonly comment: string | null;
  }) => Promise<ConsoleResult<{ readonly datasetId: string; readonly itemId: string }>>;
};
