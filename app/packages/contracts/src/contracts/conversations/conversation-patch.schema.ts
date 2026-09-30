import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none, personal } from "../field-docs.ts";
import { HAS_ANY_FIELD_ERROR, hasAnyField } from "../primitives/refinements.ts";
import { MAX_TITLE_CHARS } from "./conversation.schema.ts";

/** Body of `PATCH /v1/conversations/{conversationId}`: rename, pin, archive (owner only). */
export const ConversationPatchSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(MAX_TITLE_CHARS).optional().meta(personal("New title; sets titleSource to user.")),
    pinned: z.boolean().optional().meta(none("Pin or unpin.")),
    archived: z.boolean().optional().meta(none("Archive (true) or restore (false).")),
  })
  .refine(hasAnyField, HAS_ANY_FIELD_ERROR);
export type ConversationPatch = z.infer<typeof ConversationPatchSchema>;

export const ConversationPatchContract = defineContract(ConversationPatchSchema, {
  id: "conversations.ConversationPatch",
  kind: "command",
  description: "Renames, pins or archives one of the member's conversations.",
  examples: [{ title: "Onboarding plan" }, { pinned: true, archived: false }],
  pii: "personal",
  tenancyScope: "user",
  relations: [],
  permission: "core.conversation.update",
});
