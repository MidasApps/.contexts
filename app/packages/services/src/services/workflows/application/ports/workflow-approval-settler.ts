import type { GatewayResult } from "../../../agents/application/ports/agent-runtime-gateway.ts";

/** What the Mastra settle route did (decision 0036). */
export type SettleOutcome =
  | { readonly settled: true; readonly runStatus: string }
  | { readonly settled: false; readonly reason: "NOT_SETTLED" | "NOT_SUSPENDED" };

/**
 * Asks the private agent runtime to apply a settled SP1 approval request to its suspended
 * workflow run. The only input is the request id: Mastra reads the decision from SP1 itself, so
 * no user credential is sent (decision 0036). Errors are the gateway's status-only codes.
 */
export type WorkflowApprovalSettler = {
  readonly settle: (input: { readonly approvalRequestId: string; readonly requestId: string }) => Promise<GatewayResult<SettleOutcome>>;
};
