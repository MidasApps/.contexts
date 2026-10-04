import { TenantIdSchema, UserIdSchema } from "@core/contracts";
import { z } from "zod";

/**
 * One agent run of the usage ledger (`usage.agent_runs`, decision 0066): every non-internal
 * `AGENT_RUN` span the ledger exporter sees, and the guardrail that stopped it, if any. Internal
 * to the runtime and the staff overview, so it is not a published contract.
 */
export const AgentRunSchema = z.strictObject({
  id: z.uuid().brand<"AgentRunId">(),
  requestId: z.string().min(1).max(64).nullable(),
  traceId: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .nullable(),
  tenantId: TenantIdSchema,
  userId: UserIdSchema.nullable(),
  agentId: z.string().min(1).max(200),
  // Null: the run was not stopped by a guardrail (Mastra's `tripwireAbort.processorId` otherwise).
  tripwireProcessorId: z.string().min(1).max(200).nullable(),
  occurredAt: z.iso.datetime(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;
