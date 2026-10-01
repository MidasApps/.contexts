import type { Conversation } from "@core/contracts";
import type { Page, PageRequest } from "../../../shared/pagination/page.ts";
import { queryTokens } from "../../domain/search-tokens.ts";
import type { ConversationRepository } from "../ports/conversation-repository.ts";

export type ListConversations = (input: {
  readonly tenantId: string;
  readonly ownerId: string;
  readonly archived?: boolean;
  readonly pinned?: boolean;
  readonly q?: string;
  readonly page: PageRequest;
}) => Promise<Page<Conversation>>;

/**
 * The owner's conversations in one tenant (spec §4.1): pinned first, then the most recent turn.
 * `q` matches folded title and summary tokens; a query without any searchable word lists nothing.
 */
export const makeListConversations =
  (deps: { readonly conversations: ConversationRepository }): ListConversations =>
  async ({ tenantId, ownerId, archived, pinned, q, page }) => {
    const tokens = q === undefined ? undefined : queryTokens(q);
    if (tokens?.length === 0) return { items: [], nextCursor: null };
    return deps.conversations.list({
      tenantId,
      ownerId,
      archived: archived ?? false,
      page,
      ...(pinned === undefined ? {} : { pinned }),
      ...(tokens === undefined ? {} : { tokens }),
    });
  };
