/** What the usage ledger knows about the model calls of one trace. */
export type TraceLedgerCost = {
  /** Sum of the priced calls, in micro-USD. */
  readonly costMicroUsd: number;
  /** Calls of the trace whose model had no verified price (their cost is unknown, not zero). */
  readonly unpricedCalls: number;
};

/**
 * Cost of traces from the usage ledger (`usage.llm_calls.trace_id`, decisions 0026 and 0044).
 * One read per tenant, under that tenant's row level security; a trace without ledger rows is
 * absent from the answer.
 */
export type TraceCostReader = {
  readonly costByTrace: (input: {
    readonly tenantId: string;
    readonly traceIds: readonly string[];
    /** Calls that happened in `[from, to)`: the range keeps the read on the ledger's time index. */
    readonly from: Date;
    readonly to: Date;
  }) => Promise<ReadonlyMap<string, TraceLedgerCost>>;
};
