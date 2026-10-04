/**
 * Soft-deleted conversations waiting to be purged (SP5 Task 7, `conversation-purge`). A narrow port
 * over the SP4 `conversations` collection (decision 0033): the purge sees only ids, tenants and
 * deletion times, never titles or summaries.
 */
export type DeletedConversation = { readonly id: string; readonly tenantId: string; readonly deletedAt: string };

export type DeletedConversationStore = {
  /** Conversations with `deletedAt < before`, oldest first (a platform read across tenants). */
  readonly listDeletedBefore: (input: {
    readonly before: string;
    readonly limit: number;
  }) => Promise<DeletedConversation[]>;
  /**
   * Hard-deletes the metadata after re-reading it in a transaction.
   * @returns `false` when the document is gone or no longer deleted before `before` (restored, raced).
   */
  readonly hardDelete: (input: { readonly id: string; readonly before: string }) => Promise<boolean>;
};
