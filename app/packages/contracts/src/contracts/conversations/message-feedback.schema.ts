import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";

export const MessageRatingSchema = z.enum(["up", "down"]);

const inputShape = {
  messageId: z.string().min(1).max(128).meta(none("Assistant message rated.")),
  rating: MessageRatingSchema.meta(none("Thumbs up or down.")),
  comment: z.string().trim().min(1).max(1000).optional().meta(personal("Optional comment of the user.")),
};

/** `POST /v1/conversations/{id}/feedback` (SP5 spec §8); idempotent per message and user. */
export const MessageFeedbackInputSchema = z.strictObject({
  ...inputShape,
  addToDataset: z.boolean().optional().meta(none("Also add the turn to the tenant dataset `feedback`.")),
});
export type MessageFeedbackInput = z.infer<typeof MessageFeedbackInputSchema>;

export const MessageFeedbackInputContract = defineContract(MessageFeedbackInputSchema, {
  id: "conversations.MessageFeedbackInput",
  kind: "command",
  description: "Rates an assistant message with thumbs up or down and an optional comment.",
  examples: [
    {
      messageId: "msg_01J8Z3K4M5",
      rating: "down",
      comment: "The answer cited the wrong document.",
      addToDataset: true,
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.chat.use",
});

export const MessageFeedbackSchema = z.strictObject({
  conversationId: z.string().min(1).meta(none("Conversation of the message.")),
  tenantId: TenantIdSchema.meta(none("Organization.")),
  userId: UserIdSchema.meta(personal("User who rated.")),
  ...inputShape,
  createdAt: IsoDateTimeSchema.meta(none("First rating (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("Last change (UTC).")),
});
export type MessageFeedback = z.infer<typeof MessageFeedbackSchema>;

export const MessageFeedbackContract = defineContract(MessageFeedbackSchema, {
  id: "conversations.MessageFeedback",
  kind: "entity",
  description: "A user's rating of an assistant message; one per message and user.",
  examples: [
    {
      conversationId: "Cv1aB2cD3eF4gH5iJ6kL",
      tenantId: EXAMPLE_IDS.organization,
      userId: EXAMPLE_IDS.user,
      messageId: "msg_01J8Z3K4M5",
      rating: "up",
      createdAt: EXAMPLE_TIMES.created,
      updatedAt: EXAMPLE_TIMES.created,
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [{ target: "tenancy.Organization", type: "belongs-to", field: "tenantId" }],
  permission: "core.chat.use",
});
