import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none, personal } from "../field-docs.ts";
import { MAX_APPROVAL_REASON_CHARS } from "./chat-request.schema.ts";
import { ConversationIdSchema, EXAMPLE_CONVERSATION_ID } from "./conversation.schema.ts";

/**
 * One inline tool approval decision as `/v1/chat` audits it before forwarding
 * (`AGENT_TOOL_CALL_APPROVED|DECLINED`, decision 0032).
 */
export const ToolApprovalDecisionSchema = z.strictObject({
  conversationId: ConversationIdSchema.meta(none("Conversation of the run.")),
  runId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,128}$/)
    .meta(none("Agent run that waits for the decision.")),
  toolCallId: z.string().min(1).max(200).meta(none("Tool call decided.")),
  toolName: z.string().min(1).max(200).meta(none("Sanitized tool name the stream carried.")),
  approved: z.boolean().meta(none("Approved (true) or declined (false).")),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(MAX_APPROVAL_REASON_CHARS)
    .optional()
    .meta(personal("Reason given by the member.")),
});
export type ToolApprovalDecision = z.infer<typeof ToolApprovalDecisionSchema>;

export const ToolApprovalDecisionContract = defineContract(ToolApprovalDecisionSchema, {
  id: "conversations.ToolApprovalDecision",
  kind: "command",
  description: "A member's approve or decline of an agent tool call in the chat, audited before the run resumes.",
  examples: [
    {
      conversationId: EXAMPLE_CONVERSATION_ID,
      runId: "run-1",
      toolCallId: "call-1",
      toolName: "command_tenancy_CreateProjectInput",
      approved: false,
      reason: "Wrong project name.",
    },
  ],
  pii: "personal",
  tenancyScope: "user",
  relations: [],
  permission: "core.conversation.send",
});
