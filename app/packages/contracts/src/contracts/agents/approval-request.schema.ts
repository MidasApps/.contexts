import { z } from "zod";
import { defineContract } from "../contract.ts";
import { ContractIdSchema, PermissionSchema } from "../primitives/catalog-meta.schema.ts";
import { TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { AgentKeySchema } from "./agent-settings.schema.ts";

const none = (description: string) => ({ description, pii: "none" as const });

/** Action kind SP3 registers in SP1's `ApprovalActionHandler` registry (decision 0025). */
export const AGENT_COMMAND_ACTION_KIND = "agent-command";

/**
 * Action input of an SP1 approval request created by an agent mutation tool
 * whose permission `requiresApproval` (SP3 spec §8.1, §8.4). The SP3 handler
 * re-authorizes the requester and runs the command with `idempotencyKey`.
 * SP1 owns the approval request itself (status, approver, timestamps).
 */
export const AgentApprovalRequestSchema = z
  .strictObject({
    kind: z.literal(AGENT_COMMAND_ACTION_KIND).meta(none("Approval action kind handled by the agent runtime.")),
    tenantId: TenantIdSchema.meta(none("Organization where the command runs.")),
    requestedBy: UserIdSchema.meta({ description: "Uid of the user whose agent run asked for the command.", pii: "personal" }),
    agentId: AgentKeySchema.meta(none("Agent that proposed the command.")),
    toolId: z.string().min(1).max(200).meta(none("Tool id, `command.<contractId>`.")),
    commandId: ContractIdSchema.meta(none("Command contract id whose schema validates `input`.")),
    permission: PermissionSchema.meta(none("Permission the command requires; re-checked on execution.")),
    input: z.record(z.string(), z.unknown()).meta({ description: "Command input as validated by the command contract.", pii: "personal" }),
    runId: z.string().min(1).max(200).meta(none("Mastra run id of the agent stream.")),
    toolCallId: z.string().min(1).max(200).meta(none("Model tool call id inside the run.")),
    idempotencyKey: z.string().min(3).max(401).meta(none("`runId:toolCallId`; the command runs at most once per key.")),
    summary: z.string().min(1).max(500).meta({ description: "Human-readable description of the change for approvers.", pii: "personal" }),
    preview: z
      .strictObject({
        before: z.unknown().meta({ description: "State before the change, when the command can preview it.", pii: "personal" }),
        after: z.unknown().meta({ description: "State after the change.", pii: "personal" }),
      })
      .nullable()
      .meta({ description: "Before/after preview shown to approvers; null when unavailable.", pii: "personal" }),
  })
  .refine((request) => request.idempotencyKey === `${request.runId}:${request.toolCallId}`, {
    error: "idempotencyKey must be runId:toolCallId.",
    path: ["idempotencyKey"],
  });
export type AgentApprovalRequest = z.infer<typeof AgentApprovalRequestSchema>;

export const AgentApprovalRequestContract = defineContract(AgentApprovalRequestSchema, {
  id: "agents.ApprovalRequest",
  kind: "command",
  description: "Payload of an approval request (kind agent-command) that holds an agent mutation until a second member approves it.",
  examples: [
    {
      kind: "agent-command",
      tenantId: "Jd8sK2lPq0WnR5tYu3bV",
      requestedBy: "uA1b2C3d4E5f6G7h8I9j",
      agentId: "action",
      toolId: "command.example.ArchiveNoteCommand",
      commandId: "example.ArchiveNoteCommand",
      permission: "example.note.archive",
      input: { noteId: "Xk2mQ9vLr3TnB7pWc1aZ" },
      runId: "run_01J8Z3K4M5",
      toolCallId: "call_7",
      idempotencyKey: "run_01J8Z3K4M5:call_7",
      summary: "Archive the note Supplier follow-up",
      preview: { before: { archived: false }, after: { archived: true } },
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.approval.read",
});
