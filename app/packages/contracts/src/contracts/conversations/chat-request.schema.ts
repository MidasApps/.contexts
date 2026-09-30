import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { FileIdSchema } from "../files/stored-file.schema.ts";
import { hasUniqueItems } from "../primitives/refinements.ts";
import { OrganizationIdSchema, ProjectIdSchema } from "../tenancy/ids.schema.ts";
import { ChatAgentIdSchema, ConversationIdSchema, EXAMPLE_CONVERSATION_ID } from "./conversation.schema.ts";

export const MAX_CHAT_TEXT_CHARS = 16_000;
export const MAX_CHAT_ATTACHMENTS = 10;
export const MAX_APPROVAL_REASON_CHARS = 500;

const MessageIdSchema = z.string().min(1).max(200);

/** A user text part (`useChat` `sendMessage({ text })`). Files come only by id (`attachments`). */
export const ChatTextPartSchema = z.strictObject({
  type: z.literal("text").meta(none("Part type.")),
  text: z.string().trim().min(1).max(MAX_CHAT_TEXT_CHARS).meta(personal("What the member wrote.")),
});

/**
 * A native AI SDK approval response (decision 0032 path A): exactly the fields
 * `@mastra/ai-sdk` reads (`approval.id` is `<runId>::<toolCallId>`).
 */
export const ToolApprovalResponsePartSchema = z.strictObject({
  type: z
    .string()
    .regex(/^(?:tool-[A-Za-z0-9_-]{1,128}|dynamic-tool)$/, { error: "Expected a tool part type." })
    .meta(none("Tool part type, tool-<sanitized tool name>.")),
  toolCallId: z.string().min(1).max(200).meta(none("Tool call the decision answers.")),
  toolName: z.string().min(1).max(200).optional().meta(none("Tool name of a dynamic-tool part.")),
  state: z.literal("approval-responded").meta(none("Only answered approvals are accepted.")),
  approval: z
    .strictObject({
      id: z.string().min(1).max(400).meta(none("Approval id, <runId>::<toolCallId>.")),
      approved: z.boolean().meta(none("Whether the member approved the call.")),
      reason: z.string().trim().min(1).max(MAX_APPROVAL_REASON_CHARS).optional().meta(personal("Why the member declined or approved.")),
    })
    .meta(personal("The member's decision.")),
});
export type ToolApprovalResponsePart = z.infer<typeof ToolApprovalResponsePartSchema>;

const UserMessageSchema = z.strictObject({
  id: MessageIdSchema.meta(none("Client message id.")),
  role: z.literal("user").meta(none("A member turn.")),
  parts: z.array(ChatTextPartSchema).min(1).max(20).meta(personal("Text parts of the turn.")),
});

const ApprovalMessageSchema = z.strictObject({
  id: MessageIdSchema.meta(none("Id of the assistant message that asked for approval.")),
  role: z.literal("assistant").meta(none("The assistant message carrying the member's approval responses.")),
  parts: z.array(ToolApprovalResponsePartSchema).min(1).max(20).meta(personal("Approval responses only.")),
});

/**
 * Body of `POST /v1/chat` (SP4 spec §4.1, §6): the last message only (memory holds the rest).
 * `organizationId` is required to start a conversation; an existing one takes its tenant from
 * the stored conversation, and a given `organizationId` must match it.
 */
export const ChatRequestSchema = z
  .strictObject({
    organizationId: OrganizationIdSchema.optional().meta(none("Organization of a new conversation.")),
    projectId: ProjectIdSchema.optional().meta(none("Project of a new conversation; organization level when absent.")),
    conversationId: ConversationIdSchema.optional().meta(none("Existing conversation; a new one is created when absent.")),
    agentId: ChatAgentIdSchema.optional().meta(none("Chat agent of a new conversation (default assistant).")),
    message: z.discriminatedUnion("role", [UserMessageSchema, ApprovalMessageSchema]).meta(personal("The last message of the chat.")),
    trigger: z.enum(["submit-message", "regenerate-message"]).optional().meta(none("useChat trigger.")),
    attachments: z
      .array(FileIdSchema)
      .max(MAX_CHAT_ATTACHMENTS)
      .refine(hasUniqueItems, { error: "Attachments must be distinct." })
      .optional()
      .meta(none("Ready chat-attachment files of the caller to add to a user turn.")),
  })
  .refine((request) => request.conversationId !== undefined || request.organizationId !== undefined, {
    error: "organizationId is required to start a conversation.",
    path: ["organizationId"],
  })
  .refine((request) => request.message.role === "user" || request.attachments === undefined, {
    error: "Attachments go only with a user message.",
    path: ["attachments"],
  });
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatRequestContract = defineContract(ChatRequestSchema, {
  id: "conversations.ChatRequest",
  kind: "command",
  description: "One chat turn: the member's message (or approval responses) sent to the assistant, answered as a UI message stream.",
  examples: [
    { organizationId: EXAMPLE_IDS.organization, message: { id: "msg-1", role: "user", parts: [{ type: "text", text: "Summarize the onboarding guide." }] } },
    {
      conversationId: EXAMPLE_CONVERSATION_ID,
      message: {
        id: "msg-2",
        role: "assistant",
        parts: [{ type: "tool-command_tenancy_CreateProjectInput", toolCallId: "call-1", state: "approval-responded", approval: { id: "run-1::call-1", approved: true } }],
      },
    },
  ],
  pii: "personal",
  tenancyScope: "user",
  relations: [],
  permission: "core.conversation.send",
});
