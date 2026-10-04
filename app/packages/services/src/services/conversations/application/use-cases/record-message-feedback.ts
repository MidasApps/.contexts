import { createHash } from "node:crypto";
import type { MessageFeedback, MessageFeedbackInput, UserPrincipal } from "@core/contracts";
import type { Authorize } from "../../../access/application/ports/driving/authorize.ts";
import type { DenyReason } from "../../../access/domain/authorization.ts";
import type { ConsoleGateway } from "../../../observability/application/ports/console-gateway.ts";
import type { Clock } from "../../../shared/clock/clock.ts";
import type { Logger } from "../../../shared/observability/logger.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { MessageFeedbackStore } from "../ports/message-feedback-store.ts";
import type { GetConversation } from "./get-conversation.ts";

export type FeedbackError =
  | { readonly code: "NOT_FOUND" }
  | { readonly code: "FORBIDDEN"; readonly reason: DenyReason };

export type RecordMessageFeedback = (command: {
  readonly actor: UserPrincipal;
  readonly authorize: Authorize;
  readonly conversationId: string;
  readonly input: MessageFeedbackInput;
  readonly requestId: string;
}) => Promise<Result<MessageFeedback, FeedbackError>>;

/** The idempotency key of a rating: one per tenant, conversation, message and user. */
export const feedbackKeyOf = (parts: {
  tenantId: string;
  conversationId: string;
  messageId: string;
  userId: string;
}): string =>
  createHash("sha256")
    .update(`${parts.tenantId}\u0000${parts.conversationId}\u0000${parts.messageId}\u0000${parts.userId}`, "utf8")
    .digest("hex");

/**
 * `POST /v1/conversations/{id}/feedback` (SP5 spec §8): the owner of the conversation rates an
 * assistant message (`core.conversation.send` at its organization; another member's conversation
 * answers 404). One rating per message and user; with `addToDataset` the turn also goes to the
 * organization's `feedback` dataset (best effort: a dataset failure is logged, the rating stays).
 */
export const makeRecordMessageFeedback =
  (deps: {
    readonly getConversation: GetConversation;
    readonly feedback: MessageFeedbackStore;
    readonly console: Pick<ConsoleGateway, "addFeedbackItem">;
    readonly clock: Clock;
    readonly logger: Pick<Logger, "warn">;
  }): RecordMessageFeedback =>
  async (command) => {
    const conversation = await deps.getConversation({
      conversationId: command.conversationId,
      ownerId: command.actor.uid,
    });
    if (!conversation.ok) return err({ code: "NOT_FOUND" });
    const { tenantId } = conversation.data;
    const decision = await command.authorize({
      principal: command.actor,
      permission: "core.conversation.send",
      node: { level: "organization", tenantId },
    });
    if (!decision.allowed) return err({ code: "FORBIDDEN", reason: decision.reason });
    const { messageId, rating, comment, addToDataset } = command.input;
    const key = feedbackKeyOf({
      tenantId,
      conversationId: command.conversationId,
      messageId,
      userId: command.actor.uid,
    });
    const feedback = await deps.feedback.upsert({
      key,
      feedback: {
        conversationId: command.conversationId,
        tenantId,
        userId: command.actor.uid,
        messageId,
        rating,
        ...(comment === undefined ? {} : { comment }),
      },
      at: deps.clock.now().toISOString(),
    });
    if (addToDataset === true) {
      const added = await deps.console.addFeedbackItem({
        tenantId,
        feedbackKey: key,
        conversationId: command.conversationId,
        messageId,
        rating,
        comment: comment ?? null,
      });
      if (!added.ok)
        deps.logger.warn("feedback_dataset_item_failed", { requestId: command.requestId, errorCode: added.error.code });
    }
    return ok(feedback);
  };
