import type { ApprovalSweepPort, ConversationPurgePort, EvalExportPort } from "@core/agents";
import {
  type BigQueryEvalRunRow,
  createBigQueryEvalRunSink,
  createBigQueryLlmCallsTable,
  createFirestoreDeletedConversationStore,
  createNoopEvalRunSink,
  EVAL_RUNS_TABLE,
  type FirebaseAdmin,
  type Logger,
  makePurgeDeletedConversations,
  systemClock,
} from "@core/services";

/** SP1 sweeps (decision 0030 A3, SP5 spec §3.3) for the `approval-expiry-sweep` workflow. */
export const bindApprovalSweepPort = (approvals: {
  readonly expireApprovalRequests: (input: { requestId: string }) => Promise<{ expired: number }>;
  readonly failInterruptedApprovals: (input: { requestId: string }) => Promise<{ failed: number }>;
}): ApprovalSweepPort => ({
  expire: ({ requestId }) => approvals.expireApprovalRequests({ requestId }),
  failInterrupted: ({ requestId }) => approvals.failInterruptedApprovals({ requestId }),
});

/** Purge of SP4 conversation metadata soft-deleted more than 30 days ago (Firestore). */
export const bindConversationPurgePort = (firestore: FirebaseAdmin["firestore"]): ConversationPurgePort => {
  const purge = makePurgeDeletedConversations({ store: createFirestoreDeletedConversationStore({ firestore }), clock: systemClock });
  return { purgeDeleted: (input) => purge(input) };
};

/**
 * Eval export (decision 0040). The sink follows `USAGE_SINK` (BigQuery `eval_runs` outside local).
 * This binding has no summary source (it logs and exports nothing); `create-agent-runtime.ts` replaces
 * it with the Mastra experiments store once the storage exists (`eval-export-source.ts`, SP5 Task 11).
 */
export const bindEvalExportPort = (deps: {
  readonly env: { readonly USAGE_SINK: "none" | "bigquery"; readonly BIGQUERY_DATASET_AI_OBSERVABILITY: string; readonly FIREBASE_PROJECT_ID: string };
  readonly logger: Logger;
}): EvalExportPort => {
  const sink =
    deps.env.USAGE_SINK === "bigquery"
      ? createBigQueryEvalRunSink({
          table: createBigQueryLlmCallsTable<BigQueryEvalRunRow>({ dataset: deps.env.BIGQUERY_DATASET_AI_OBSERVABILITY, table: EVAL_RUNS_TABLE, projectId: deps.env.FIREBASE_PROJECT_ID }),
        })
      : createNoopEvalRunSink(deps.logger);
  return {
    listFinishedSince: ({ since }) => {
      deps.logger.info("eval_export_source_unwired", { since });
      return Promise.resolve([]);
    },
    exportSummaries: (summaries) => sink.exportSummaries(summaries),
  };
};
