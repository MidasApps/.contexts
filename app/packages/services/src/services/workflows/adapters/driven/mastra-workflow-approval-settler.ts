import { FORWARDED_HEADERS } from "@core/contracts";
import { z } from "zod";
import type { GatewayResult } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import { mapMastraStatus, UPSTREAM_TIMEOUT, UPSTREAM_UNAVAILABLE } from "../../../agents/adapters/driven/mastra-error-mapper.ts";
import type { ServerlessIdTokenSource } from "../../../agents/adapters/driven/serverless-id-token.ts";
import type { SettleOutcome, WorkflowApprovalSettler } from "../../application/ports/workflow-approval-settler.ts";

/** A settle waits for the run's next suspension or end (decision 0036). */
export const DEFAULT_SETTLE_TIMEOUT_MS = 60_000;

const SettleResponseSchema = z.object({
  data: z.union([
    z.strictObject({ settled: z.literal(true), runStatus: z.string().min(1) }),
    z.strictObject({ settled: z.literal(false), reason: z.enum(["NOT_SETTLED", "NOT_SUSPENDED"]) }),
  ]),
});

export type MastraWorkflowApprovalSettlerOptions = {
  /** `MASTRA_URL` (private Cloud Run URL outside local). */
  readonly baseUrl: string;
  /** `null` in local; the Cloud Run ID token source elsewhere. */
  readonly serverlessToken: ServerlessIdTokenSource | null;
  readonly timeoutMs?: number;
  /** Test seam; defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
};

const headersOf = async (options: MastraWorkflowApprovalSettlerOptions, requestId: string): Promise<Record<string, string>> => ({
  [FORWARDED_HEADERS.requestId]: requestId,
  ...(options.serverlessToken === null ? {} : { [FORWARDED_HEADERS.serverlessAuthorization]: await options.serverlessToken.headerValue() }),
});

/**
 * `WorkflowApprovalSettler` over the Mastra settle route (`POST /workflow-approvals/:id/settle`,
 * a custom route outside the API prefix). Sends no user credential: the route only reconciles
 * what SP1 stored (decision 0036). Status-only error mapping, like the gateway: the upstream body
 * of an error is never read.
 */
export const createMastraWorkflowApprovalSettler = (options: MastraWorkflowApprovalSettlerOptions): WorkflowApprovalSettler => {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;
  return {
    settle: async ({ approvalRequestId, requestId }): Promise<GatewayResult<SettleOutcome>> => {
      const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_SETTLE_TIMEOUT_MS);
      try {
        const url = `${baseUrl}/workflow-approvals/${encodeURIComponent(approvalRequestId)}/settle`;
        const response = await fetchFn(url, { method: "POST", headers: await headersOf(options, requestId), signal });
        if (!response.ok) {
          await response.body?.cancel();
          return { ok: false, error: mapMastraStatus(response.status, response.headers.get("retry-after")) };
        }
        const parsed = SettleResponseSchema.safeParse(await response.json());
        return parsed.success ? { ok: true, data: parsed.data.data } : { ok: false, error: UPSTREAM_UNAVAILABLE };
      } catch {
        // Network failure, timeout or a body that is not JSON: never surfaced as is.
        return { ok: false, error: signal.aborted ? UPSTREAM_TIMEOUT : UPSTREAM_UNAVAILABLE };
      }
    },
  };
};
