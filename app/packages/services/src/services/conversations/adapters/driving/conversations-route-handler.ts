import {
  type Conversation,
  deleteConversationEndpoint,
  getConversationEndpoint,
  listConversationMessagesEndpoint,
  listConversationsEndpoint,
  summarizeConversationEndpoint,
  type UserPrincipal,
  updateConversationEndpoint,
} from "@core/contracts";
import type { Authorize } from "#/services/access/application/ports/driving/authorize.ts";
import { gatewayErrorResponse } from "#/services/agents/adapters/driven/mastra-error-mapper.ts";
import { auditActorOf } from "#/services/audit/domain/audit-actor.ts";
import { apiError, dataResponse, noContentResponse } from "#/services/shared/http/api-errors.ts";
import { deniedResponse, invalidCursorResponse, listResponse, pageRequestOf } from "#/services/shared/http/api-list.ts";
import { withApiRoute } from "#/services/shared/http/api-route.ts";
import type { RouteHandler } from "#/services/shared/http/route-boundary.ts";
import { makeListMessages } from "../../application/use-cases/list-messages.ts";
import { conversationNode } from "../../application/use-cases/send-chat-message.ts";
import { makeSummarizeConversation } from "../../application/use-cases/summarize-conversation.ts";
import { type ChatRoutesDeps, chatScopeOf } from "./chat-http.ts";

export const CONVERSATION_PERMISSIONS = {
  read: "core.conversation.read",
  update: "core.conversation.update",
  delete: "core.conversation.delete",
} as const;

/** The caller's conversation after the owner check and `authorize(permission)`, or the refusal. */
const loadOwned = async (args: {
  readonly deps: ChatRoutesDeps;
  readonly principal: UserPrincipal;
  readonly conversationId: string;
  readonly permission: string;
  readonly authorize: Authorize;
  readonly requestId: string;
}): Promise<Conversation | Response> => {
  const found = await args.deps.conversations.getConversation({
    conversationId: args.conversationId,
    ownerId: args.principal.uid,
  });
  if (!found.ok) return apiError(404, "NOT_FOUND", args.requestId);
  const decision = await args.authorize({
    principal: args.principal,
    permission: args.permission,
    node: conversationNode(found.data),
  });
  return decision.allowed ? found.data : deniedResponse(decision.reason, args.requestId);
};

const buildListRoute = (deps: ChatRoutesDeps): RouteHandler =>
  withApiRoute(listConversationsEndpoint, deps.pipeline, async ({ principal, input, authorize, requestId }) => {
    const { organizationId: tenantId, archived, pinned, q, cursor, limit } = input.query;
    const decision = await authorize({
      principal,
      permission: CONVERSATION_PERMISSIONS.read,
      node: { level: "organization", tenantId },
    });
    if (!decision.allowed) return deniedResponse(decision.reason, requestId);
    const page = pageRequestOf({ limit, ...(cursor === undefined ? {} : { cursor }) });
    if (page === null) return invalidCursorResponse(requestId);
    const listed = await deps.conversations.listConversations({
      tenantId,
      ownerId: principal.uid,
      page,
      ...(archived === undefined ? {} : { archived }),
      ...(pinned === undefined ? {} : { pinned }),
      ...(q === undefined ? {} : { q }),
    });
    return listResponse(listed, limit);
  });

const buildGetRoute = (deps: ChatRoutesDeps): RouteHandler =>
  withApiRoute(getConversationEndpoint, deps.pipeline, async ({ principal, input, authorize, requestId }) => {
    const owned = await loadOwned({
      deps,
      principal,
      conversationId: input.params.conversationId,
      permission: CONVERSATION_PERMISSIONS.read,
      authorize,
      requestId,
    });
    return owned instanceof Response ? owned : dataResponse({ data: owned });
  });

const buildUpdateRoute = (deps: ChatRoutesDeps): RouteHandler =>
  withApiRoute(updateConversationEndpoint, deps.pipeline, async ({ principal, input, authorize, requestId }) => {
    const owned = await loadOwned({
      deps,
      principal,
      conversationId: input.params.conversationId,
      permission: CONVERSATION_PERMISSIONS.update,
      authorize,
      requestId,
    });
    if (owned instanceof Response) return owned;
    const updated = await deps.conversations.updateConversation({
      conversationId: owned.id,
      ownerId: principal.uid,
      patch: input.body,
    });
    return updated.ok ? dataResponse({ data: updated.data }) : apiError(404, "NOT_FOUND", requestId);
  });

/**
 * `DELETE /v1/conversations/{id}` (decision 0033): the memory thread is deleted on Mastra first
 * (a thread that never existed counts as deleted), then the metadata is soft-deleted and
 * `CONVERSATION_DELETED` audited. A streaming conversation answers 409 (stop it first).
 */
const buildDeleteRoute = (deps: ChatRoutesDeps): RouteHandler =>
  withApiRoute(
    deleteConversationEndpoint,
    deps.pipeline,
    async ({ principal, input, authorize, requestId, request, audit }) => {
      const owned = await loadOwned({
        deps,
        principal,
        conversationId: input.params.conversationId,
        permission: CONVERSATION_PERMISSIONS.delete,
        authorize,
        requestId,
      });
      if (owned instanceof Response) return owned;
      const scope = await chatScopeOf({ deps, principal, conversation: owned, request, requestId });
      if (scope === null) return apiError(403, "FORBIDDEN", requestId);
      const deleteMessages = async (conversation: Conversation) => {
        const deleted = await deps.chat.deleteThread({
          scope,
          agentId: conversation.agentId,
          threadId: conversation.id,
        });
        return deleted.ok || deleted.error.code === "NOT_FOUND";
      };
      const result = await deps.conversations.deleteConversation({
        conversationId: owned.id,
        ownerId: principal.uid,
        deleteMessages,
      });
      if (!result.ok) {
        if (result.error.code === "CONVERSATION_STREAMING") return apiError(409, "CONFLICT", requestId);
        return result.error.code === "THREAD_DELETE_FAILED"
          ? apiError(502, "UPSTREAM_UNAVAILABLE", requestId)
          : apiError(404, "NOT_FOUND", requestId);
      }
      await audit.record({
        log: "tenant",
        tenantId: owned.tenantId,
        action: "CONVERSATION_DELETED",
        actor: auditActorOf(principal),
        target: { type: "conversation", id: owned.id },
        node: { level: "organization", tenantId: owned.tenantId },
        outcome: "success",
        requestId,
      });
      return noContentResponse();
    },
  );

const buildMessagesRoute = (deps: ChatRoutesDeps): RouteHandler =>
  withApiRoute(
    listConversationMessagesEndpoint,
    deps.pipeline,
    async ({ principal, input, authorize, requestId, request }) => {
      const owned = await loadOwned({
        deps,
        principal,
        conversationId: input.params.conversationId,
        permission: CONVERSATION_PERMISSIONS.read,
        authorize,
        requestId,
      });
      if (owned instanceof Response) return owned;
      const scope = await chatScopeOf({ deps, principal, conversation: owned, request, requestId });
      if (scope === null) return apiError(403, "FORBIDDEN", requestId);
      const { cursor, limit } = input.query;
      const listed = await makeListMessages({ chat: deps.chat })({
        conversation: owned,
        scope,
        limit,
        ...(cursor === undefined ? {} : { cursor }),
      });
      if (!listed.ok) return gatewayErrorResponse(listed.error, requestId);
      return listResponse({ items: listed.data.messages, nextCursor: listed.data.nextCursor }, limit);
    },
  );

const buildSummaryRoute = (deps: ChatRoutesDeps): RouteHandler =>
  withApiRoute(
    summarizeConversationEndpoint,
    deps.pipeline,
    async ({ principal, input, authorize, requestId, request }) => {
      const owned = await loadOwned({
        deps,
        principal,
        conversationId: input.params.conversationId,
        permission: CONVERSATION_PERMISSIONS.update,
        authorize,
        requestId,
      });
      if (owned instanceof Response) return owned;
      const scope = await chatScopeOf({ deps, principal, conversation: owned, request, requestId });
      if (scope === null) return apiError(403, "FORBIDDEN", requestId);
      const summarize = makeSummarizeConversation({
        conversations: deps.conversations.conversations,
        chat: deps.chat,
        clock: deps.conversations.clock,
      });
      const summarized = await summarize({ conversation: owned, scope });
      return summarized.ok
        ? dataResponse({ data: summarized.data })
        : gatewayErrorResponse(summarized.error, requestId);
    },
  );

/**
 * `/v1/conversations` (SP4 spec §4.1, decision 0033): history list (pinned first, cursor pages,
 * `archived`, `pinned`, `q`), read, rename/pin/archive, delete, messages and summary. Owner-only:
 * another member's conversation answers 404.
 */
export const buildConversationsRoutes = (deps: ChatRoutesDeps): Record<string, RouteHandler> => ({
  [listConversationsEndpoint.id]: buildListRoute(deps),
  [getConversationEndpoint.id]: buildGetRoute(deps),
  [updateConversationEndpoint.id]: buildUpdateRoute(deps),
  [deleteConversationEndpoint.id]: buildDeleteRoute(deps),
  [listConversationMessagesEndpoint.id]: buildMessagesRoute(deps),
  [summarizeConversationEndpoint.id]: buildSummaryRoute(deps),
});
