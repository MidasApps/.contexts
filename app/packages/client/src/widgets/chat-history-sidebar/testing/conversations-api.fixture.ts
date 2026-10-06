// Test helper: a small stateful `/v1/conversations` behind the fake API, with the server's own
// ordering (pinned first, then most recent) and filters (archived, q), so history tests assert
// what the member sees after each action rather than which calls were made.
import { ConversationContract } from "@core/contracts";
import { apiError, type FakeApi, noContent, ok, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";

export type FakeConversation = Record<string, unknown> & {
  id: string;
  title: string | null;
  pinned: boolean;
  archivedAt: string | null;
  summary: string | null;
  lastMessageAt: string;
};

export const buildConversation = (id: string, overrides: Partial<FakeConversation> = {}): FakeConversation => ({
  ...(ConversationContract.meta.examples[0] as Record<string, unknown>),
  id,
  tenantId: IDS.organization,
  projectId: IDS.project,
  title: `Conversa ${id}`,
  pinned: false,
  archivedAt: null,
  summary: null,
  lastMessageAt: "2026-09-30T12:00:00.000Z",
  ...overrides,
});

const matches = (conversation: FakeConversation, q: string | null): boolean =>
  q === null || `${conversation.title ?? ""} ${conversation.summary ?? ""}`.toLowerCase().includes(q.toLowerCase());

const ordered = (items: readonly FakeConversation[]): FakeConversation[] =>
  [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastMessageAt.localeCompare(a.lastMessageAt));

export type ConversationsStore = { items: FakeConversation[]; summaryText: string };

/** Routes of `/v1/conversations` over `store` (mutated in place by PATCH, DELETE and summary). */
export const routeConversationsApi = (api: FakeApi, store: ConversationsStore): void => {
  api.route("GET /v1/conversations", ({ query }) => {
    const archived = query.get("archived") === "true";
    return page(
      ordered(store.items.filter((item) => (item.archivedAt !== null) === archived && matches(item, query.get("q")))),
    );
  });
  api.route("PATCH /v1/conversations/:conversationId", ({ params, body }) => {
    const target = store.items.find((item) => item.id === params["conversationId"]);
    if (target === undefined) return apiError(404, "NOT_FOUND");
    const patch = body as { title?: string; pinned?: boolean; archived?: boolean };
    if (patch.title !== undefined) target.title = patch.title;
    if (patch.pinned !== undefined) target.pinned = patch.pinned;
    if (patch.archived !== undefined) target.archivedAt = patch.archived ? "2026-10-01T09:00:00.000Z" : null;
    return ok(target);
  });
  api.route("DELETE /v1/conversations/:conversationId", ({ params }) => {
    store.items = store.items.filter((item) => item.id !== params["conversationId"]);
    return noContent();
  });
  api.route("POST /v1/conversations/:conversationId/summary", ({ params }) => {
    const target = store.items.find((item) => item.id === params["conversationId"]);
    if (target === undefined) return apiError(404, "NOT_FOUND");
    target.summary = store.summaryText;
    return ok(target);
  });
};
