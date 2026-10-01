import type { MessageFeedback } from "@core/contracts";

/**
 * Ratings of assistant messages (SP5 spec §8): one document per message and user, so a second
 * rating replaces the first (`createdAt` kept, `updatedAt` moved).
 */
export type MessageFeedbackStore = {
  readonly upsert: (input: { readonly key: string; readonly feedback: Omit<MessageFeedback, "createdAt" | "updatedAt">; readonly at: string }) => Promise<MessageFeedback>;
};
