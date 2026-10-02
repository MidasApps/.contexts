"use client";

import type { Conversation } from "@core/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { SquarePenIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";
import { useTranslations } from "use-intl";
import { ASSISTANT_AGENT_ID, agentNameOf, useChatAgents } from "#/entities/chat-agent/index.ts";
import { ConversationItem, conversationsQuery } from "#/entities/conversation/index.ts";
import { ConversationActionsMenu, HistorySearch, RenameConversationForm } from "#/features/chat-history/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { isApiErrorStatus } from "#/shared/api/cursor-list.ts";
import { cn } from "#/shared/lib/cn.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { NoAccessState } from "#/shared/ui/molecules/NoAccessState/NoAccessState.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import { useRenamingRow } from "../model/use-renaming-row.ts";

export type ChatHistorySidebarProps = {
  organizationId: string;
  /** Project of the chat route the rows link to. */
  projectId: string;
  /** The conversation on screen. */
  activeConversationId?: string | undefined;
  /** A row or "new conversation" was followed (the compact layout closes its sheet). */
  onNavigate?: (() => void) | undefined;
  onDeleted?: ((conversationId: string) => void) | undefined;
  /** Closes the host (the compact sheet): a close button ends the header instead of a corner X over it. */
  onClose?: (() => void) | undefined;
  className?: string | undefined;
};

type ListQuery = ReturnType<typeof useConversationList>;

/** How often the list is read again while a conversation in it is still answering. */
const ANSWERING_POLL_MS = 4000;

const useConversationList = (organizationId: string, filter: { archived: boolean; q: string }) => {
  const callEndpoint = useCallEndpoint();
  return useInfiniteQuery({
    ...conversationsQuery(callEndpoint, organizationId, filter),
    // "Respondendo" and the generated title change on the server without any action here.
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => page.data.some((conversation) => conversation.activeRunId !== null)) ===
      true
        ? ANSWERING_POLL_MS
        : false,
  });
};

function EmptyList({ q, archived }: { q: string; archived: boolean }) {
  const t = useTranslations("chat.history");
  if (q !== "")
    return (
      <EmptyState
        frame="plain"
        headingLevel={3}
        icon="search"
        title={t("emptySearch.title")}
        description={t("emptySearch.description", { q })}
      />
    );
  if (archived)
    return (
      <EmptyState
        frame="plain"
        headingLevel={3}
        icon="inbox"
        title={t("emptyArchived.title")}
        description={t("emptyArchived.description")}
      />
    );
  return (
    <EmptyState
      frame="plain"
      headingLevel={3}
      icon="message"
      title={t("empty.title")}
      description={t("empty.description")}
    />
  );
}

/** Loading, no permission, failure (offline or not) or nothing to list; `null` when there are rows. */
function ListState({
  query,
  q,
  archived,
  online,
}: {
  query: ListQuery;
  q: string;
  archived: boolean;
  online: boolean;
}) {
  const t = useTranslations("chat.history");
  if (query.isPending) return <LoadingState label={t("loading")} rows={6} className="px-2" />;
  if (query.isError && isApiErrorStatus(query.error, 403))
    return <NoAccessState frame="plain" headingLevel={3} description={t("noAccess")} />;
  if (query.isError && !online) return null;
  if (query.isError)
    return (
      <ApiErrorState
        frame="plain"
        headingLevel={3}
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  return query.data.length === 0 ? <EmptyList q={q} archived={archived} /> : null;
}

/** Search, the count of listed conversations, the archived toggle and the offline notice. */
function HistoryToolbar({
  query,
  count,
  archived,
  online,
  onSearch,
  onToggleArchived,
}: {
  query: ListQuery;
  count: number;
  archived: boolean;
  online: boolean;
  onSearch: (q: string) => void;
  onToggleArchived: () => void;
}) {
  const t = useTranslations("chat.history");
  return (
    <div className="flex shrink-0 flex-col gap-2 px-3 py-2">
      <HistorySearch onSearch={onSearch} />
      <div className="flex items-center justify-between gap-2">
        <p role="status" data-slot="history-count" className="text-caption text-muted-foreground">
          {/* While more pages exist, the loaded rows are not the total. */}
          {query.isSuccess ? t(query.hasNextPage ? "countLoaded" : "count", { count }) : ""}
        </p>
        <Button variant={archived ? "secondary" : "ghost"} size="sm" aria-pressed={archived} onClick={onToggleArchived}>
          {t("showArchived")}
        </Button>
      </div>
      {online ? null : <OfflineNotice onRetry={() => void query.refetch()} />}
    </div>
  );
}

type ConversationRowProps = {
  organizationId: string;
  /** Project of the chat route, for conversations that do not name their own. */
  projectId: string;
  conversation: Conversation;
  active: boolean;
  agentName: string | undefined;
  /** The row shows the rename form instead of its link. */
  renaming: boolean;
  /** Opens the rename form on a row (`undefined` closes it). */
  onRename: (conversationId: string | undefined) => void;
  onNavigate: (() => void) | undefined;
  onDeleted: ((conversationId: string) => void) | undefined;
};

/** One conversation: its link to the chat, its rename form while renaming, and its actions menu. */
function ConversationRow({
  organizationId,
  projectId,
  conversation,
  active,
  agentName,
  renaming,
  onRename,
  onNavigate,
  onDeleted,
}: ConversationRowProps) {
  return (
    <ConversationItem
      conversation={conversation}
      to={{
        id: "chat",
        organizationId,
        projectId: conversation.projectId ?? projectId,
        conversationId: conversation.id,
      }}
      active={active}
      agentName={agentName}
      onNavigate={onNavigate}
      editing={
        renaming ? (
          <RenameConversationForm
            organizationId={organizationId}
            conversation={conversation}
            onDone={() => onRename(undefined)}
          />
        ) : undefined
      }
      actions={
        <ConversationActionsMenu
          organizationId={organizationId}
          conversation={conversation}
          onRename={() => onRename(conversation.id)}
          onDeleted={onDeleted}
        />
      }
    />
  );
}

/**
 * The conversation history beside the chat (chat.html §23.5, SP4 spec §4.1): the member's own
 * conversations — pinned first, then most recent — with search, the archived ones behind a
 * toggle, and the actions of each row. Server state lives in the query cache; the only local
 * state is the filter and which row is being renamed.
 */
export function ChatHistorySidebar({
  organizationId,
  projectId,
  activeConversationId,
  onNavigate,
  onDeleted,
  onClose,
  className,
}: ChatHistorySidebarProps) {
  const t = useTranslations("chat.history");
  const online = useOnlineStatus();
  const titleId = useId();
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const query = useConversationList(organizationId, { archived, q });
  const { renamingId, setRenamingId, listRef } = useRenamingRow();

  const conversations: readonly Conversation[] = query.data ?? [];
  const tAgents = useTranslations("chat.agents");
  const agents = useChatAgents(organizationId);
  const agentNameFor = (agentId: string): string | undefined =>
    agentId === ASSISTANT_AGENT_ID
      ? undefined
      : (agentNameOf({ agentId, agents: agents.data, assistant: tAgents("assistant") }) ?? tAgents("unknown"));
  const state = <ListState query={query} q={q} archived={archived} online={online} />;

  return (
    <nav
      data-slot="chat-history-sidebar"
      aria-labelledby={titleId}
      className={cn("flex h-full min-h-0 flex-col bg-card", className)}
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <h2 id={titleId} className="truncate text-sm font-semibold text-foreground">
          {t("title")}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <RouteLink to={{ id: "chat", organizationId, projectId }} onClick={onNavigate}>
              <SquarePenIcon aria-hidden="true" />
              {t("new")}
            </RouteLink>
          </Button>
          {onClose === undefined ? null : (
            <Button variant="ghost" size="icon-sm" aria-label={t("close")} onClick={onClose}>
              <XIcon aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <HistoryToolbar
        query={query}
        count={conversations.length}
        archived={archived}
        online={online}
        onSearch={setQ}
        onToggleArchived={() => setArchived((current) => !current)}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        {state}
        {conversations.length === 0 ? null : (
          <ul ref={listRef} aria-label={t("listLabel")} className="flex list-none flex-col gap-0.5">
            {conversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                organizationId={organizationId}
                projectId={projectId}
                conversation={conversation}
                active={conversation.id === activeConversationId}
                agentName={agentNameFor(conversation.agentId)}
                renaming={renamingId === conversation.id}
                onRename={setRenamingId}
                onNavigate={onNavigate}
                onDeleted={onDeleted}
              />
            ))}
          </ul>
        )}
        {query.hasNextPage ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            pending={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {t("loadMore")}
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
