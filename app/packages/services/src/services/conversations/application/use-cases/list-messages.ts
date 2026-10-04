import { ChatUiMessageSchema, type Conversation } from "@core/contracts";
import { z } from "zod";
import type { AgentCallScope, GatewayError } from "#/services/agents/application/ports/agent-runtime-gateway.ts";
import type { ChatRuntimeGateway } from "#/services/agents/application/ports/chat-runtime-gateway.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";

const MessagesSchema = z.array(ChatUiMessageSchema);
type UiMessage = z.infer<typeof ChatUiMessageSchema>;

/** A page of messages and the cursor of the next (older) page: the page index, opaque to clients. */
export type MessagesPage = { readonly messages: readonly UiMessage[]; readonly nextCursor: string | null };

export type ListMessages = (input: {
  readonly conversation: Conversation;
  readonly scope: AgentCallScope;
  readonly cursor?: string;
  readonly limit: number;
}) => Promise<Result<MessagesPage, GatewayError>>;

/**
 * Stored messages of a conversation as AI SDK v7 UI messages (spec §4.1): Mastra converts them
 * (`toAISdkMessages`, `validateUIMessages`); `/v1` checks the shape again before answering, so a
 * malformed upstream page is a 502, never passed through.
 */
export const makeListMessages =
  (deps: { readonly chat: ChatRuntimeGateway }): ListMessages =>
  async ({ conversation, scope, cursor, limit }) => {
    const page = cursor === undefined ? 0 : Number(cursor);
    const answer = await deps.chat.listMessages({ scope, agentId: conversation.agentId, page, perPage: limit });
    if (!answer.ok) return err(answer.error);
    const parsed = MessagesSchema.safeParse(answer.data.messages);
    if (!parsed.success) return err({ code: "UPSTREAM_UNAVAILABLE", status: 502 });
    return ok({ messages: parsed.data, nextCursor: answer.data.hasMore ? String(page + 1) : null });
  };
