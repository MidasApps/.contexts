import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import type { ApprovalSweepPort } from "../runtime/runtime-ports.ts";
import { isPlatformRun, PLATFORM_ONLY } from "./platform-only.ts";

export const APPROVAL_EXPIRY_SWEEP_WORKFLOW_ID = "approval-expiry-sweep";
/** Platform schedule (SP5 spec §3.2): every 15 minutes, UTC. */
export const APPROVAL_EXPIRY_SWEEP_CRON = "*/15 * * * *";

export const ApprovalSweepResultSchema = z.strictObject({
  status: z.enum(["done", "failed"]),
  expired: z.int().min(0),
  failed: z.int().min(0),
  code: z.string().nullable(),
});
export type ApprovalSweepResult = z.infer<typeof ApprovalSweepResultSchema>;

/**
 * `approval-expiry-sweep` (SP5 spec §3.2, §3.3): stores `expired` on overdue pending SP1 requests
 * (audited `APPROVAL_EXPIRED`; the settle trigger then resumes their workflow runs with `expired`)
 * and fails requests still `approved` 15 minutes after their update (decision 0030 A3,
 * `EXECUTION_INTERRUPTED`; a `workflow-resume` run then stays suspended until staff cancel it,
 * decision 0036). Platform only; each pass handles one batch and the next fire takes the rest.
 */
export const createApprovalExpirySweepWorkflow = (deps: { readonly approvalSweeps: ApprovalSweepPort }) =>
  createWorkflow({
    id: APPROVAL_EXPIRY_SWEEP_WORKFLOW_ID,
    description: "Expires overdue approval requests and fails interrupted executions.",
    inputSchema: z.strictObject({}),
    outputSchema: ApprovalSweepResultSchema,
  })
    .then(
      createStep({
        id: "sweep",
        inputSchema: z.strictObject({}),
        outputSchema: ApprovalSweepResultSchema,
        execute: async ({ requestContext, runId }) => {
          if (!isPlatformRun(requestContext)) return { status: "failed" as const, expired: 0, failed: 0, code: PLATFORM_ONLY };
          const { expired } = await deps.approvalSweeps.expire({ requestId: runId });
          const { failed } = await deps.approvalSweeps.failInterrupted({ requestId: runId });
          return { status: "done" as const, expired, failed, code: null };
        },
      }),
    )
    .commit();
