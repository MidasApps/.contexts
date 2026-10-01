import type { Conversation, ConversationId } from "@core/contracts";
import type { Clock } from "../../../shared/clock/clock.ts";
import { ACTIVE_RUN_TTL_MS, MAX_ACTIVE_STREAMS_PER_TENANT } from "../../domain/conversation.ts";
import type { ConversationRepository } from "../ports/conversation-repository.ts";

export type ActiveRuns = {
  /** Whether the tenant may open another stream (spec §6: 5 concurrent streams per tenant). */
  readonly hasStreamCapacity: (tenantId: string) => Promise<boolean>;
  /** Records the run `/v1/chat` just started (resume and stop address it). */
  readonly start: (input: { readonly conversationId: ConversationId; readonly runId: string }) => Promise<void>;
  /**
   * Ends a run when its stream closed, `finish` or not (an aborted durable stream has none): clears
   * `activeRunId` if it is still this run, counts the turn and copies the automatic title.
   */
  readonly end: (input: { readonly conversationId: ConversationId; readonly runId: string; readonly title?: string }) => Promise<Conversation | null>;
};

/** The active-run bookkeeping of the chat (spec §4.1, §4.2; decision 0031). */
export const makeActiveRuns = (deps: { readonly conversations: ConversationRepository; readonly clock: Clock }): ActiveRuns => ({
  hasStreamCapacity: async (tenantId) => {
    const since = new Date(deps.clock.now().getTime() - ACTIVE_RUN_TTL_MS).toISOString();
    return (await deps.conversations.countActiveRuns({ tenantId, since })) < MAX_ACTIVE_STREAMS_PER_TENANT;
  },
  start: ({ conversationId, runId }) => deps.conversations.startRun({ conversationId, runId, startedAt: deps.clock.now().toISOString() }),
  end: ({ conversationId, runId, title }) =>
    deps.conversations.endRun({ conversationId, runId, endedAt: deps.clock.now().toISOString(), ...(title === undefined ? {} : { title }) }),
});
