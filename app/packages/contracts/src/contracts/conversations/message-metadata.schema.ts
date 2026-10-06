import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none, personal } from "../field-docs.ts";
import { FileIdSchema } from "../files/stored-file.schema.ts";
import { ChatAgentIdSchema, ConversationIdSchema, EXAMPLE_CONVERSATION_ID } from "./conversation.schema.ts";

/** An attachment as the history shows it (SP4 spec §4.3). */
export const MessageAttachmentSchema = z.strictObject({
  fileId: FileIdSchema.meta(none("Uploaded file id.")),
  name: z.string().min(1).max(255).meta(personal("Original file name.")),
  mediaType: z.string().min(1).max(255).meta(none("Media type detected from the bytes.")),
  sizeBytes: z.int().nonnegative().meta(none("Size in bytes.")),
});
export type MessageAttachment = z.infer<typeof MessageAttachmentSchema>;

/**
 * `metadata` of chat UI messages (`useChat` `messageMetadataSchema`): the conversation and
 * agent of the turn, the answer's confidence (SP3 CitationGuard) and the user's attachments.
 */
export const MessageMetadataSchema = z.strictObject({
  conversationId: ConversationIdSchema.optional().meta(none("Conversation of the message.")),
  agentId: ChatAgentIdSchema.optional().meta(none("Agent that answered.")),
  confidence: z.enum(["low", "normal"]).optional().meta(none("low when the answer is not grounded in its citations.")),
  attachments: z.array(MessageAttachmentSchema).max(10).optional().meta(personal("Files attached to a user message.")),
});
export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;

export const MessageMetadataContract = defineContract(MessageMetadataSchema, {
  id: "conversations.MessageMetadata",
  kind: "view",
  description: "Metadata of a chat message: conversation, agent, answer confidence and attachments.",
  examples: [
    {
      conversationId: EXAMPLE_CONVERSATION_ID,
      agentId: "assistant",
      confidence: "normal",
      attachments: [{ fileId: "Fz9sK2lPq0WnR5tYu3bV", name: "diagram.png", mediaType: "image/png", sizeBytes: 48_213 }],
    },
  ],
  pii: "personal",
  tenancyScope: "user",
  relations: [],
});
