import { type Conversation, MAX_SUMMARY_CHARS } from "@core/contracts";
import type { AgentCallScope, GatewayError } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import type { ChatRuntimeGateway } from "../../../agents/application/ports/chat-runtime-gateway.ts";
import type { Clock } from "../../../shared/clock/clock.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { buildSearchTokens } from "../../domain/search-tokens.ts";
import type { ConversationRepository } from "../ports/conversation-repository.ts";

export type SummarizeConversation = (input: { readonly conversation: Conversation; readonly scope: AgentCallScope }) => Promise<Result<Conversation, GatewayError>>;

/**
 * Summarizes a conversation (spec §4.1): Mastra reads the last 100 messages and answers with the
 * `fast` role; `/v1` stores the summary and refreshes the search tokens from title and summary.
 */
export const makeSummarizeConversation =
  (deps: { readonly conversations: ConversationRepository; readonly chat: ChatRuntimeGateway; readonly clock: Clock }): SummarizeConversation =>
  async ({ conversation, scope }) => {
    const answer = await deps.chat.summarize({ scope, agentId: conversation.agentId });
    if (!answer.ok) return err(answer.error);
    const summary = answer.data.summary.trim().slice(0, MAX_SUMMARY_CHARS);
    if (summary === "") return err({ code: "CONFLICT", status: 409 });
    const latest = (await deps.conversations.get(conversation.id)) ?? conversation;
    const next: Conversation = { ...latest, summary, searchTokens: buildSearchTokens({ title: latest.title, summary }), updatedAt: deps.clock.now().toISOString() };
    await deps.conversations.save(next);
    return ok(next);
  };
