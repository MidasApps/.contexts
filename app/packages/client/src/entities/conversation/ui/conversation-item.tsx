"use client";

import type { Conversation } from "@core/contracts";
import { PinIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useFormatter, useNow, useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { useFormatDateTime } from "#/shared/lib/format/index.ts";
import type { Route } from "#/shared/lib/router/route-paths.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";

export type ConversationItemProps = {
  conversation: Conversation;
  /** Where the conversation opens. */
  to: Route;
  /** This conversation is the one on screen. */
  active?: boolean | undefined;
  /** Replaces the title link (inline rename form). */
  editing?: ReactNode;
  /** Trailing control (the actions menu of the history feature). */
  actions?: ReactNode;
  onNavigate?: (() => void) | undefined;
  /** The organization's agent that answers it (decision 0046); nothing for the assistant. */
  agentName?: string | undefined;
};

/**
 * One row of the conversation history (chat.html §23.5): the title as the link, when it was last
 * used (relative, with the exact time as the tooltip and for screen readers), and what qualifies
 * it in words — pinned, answering now — never an icon or colour alone.
 */
export function ConversationItem({
  conversation,
  to,
  active = false,
  editing,
  actions,
  onNavigate,
  agentName,
}: ConversationItemProps) {
  const t = useTranslations("chat.history");
  const format = useFormatter();
  const now = useNow();
  const formatDateTime = useFormatDateTime();
  const title = conversation.title ?? t("untitled");
  return (
    <li
      data-slot="conversation-item"
      data-conversation-id={conversation.id}
      data-active={active}
      className={cn(
        "group flex items-center gap-1 rounded-sm px-2 py-1.5",
        active ? "bg-accent" : "hover:bg-accent/60",
      )}
    >
      <div className="min-w-0 flex-1">
        {editing ?? (
          <RouteLink
            to={to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className="block truncate text-body font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {title}
          </RouteLink>
        )}
        {/* On the active row's accent background the muted tone falls below 4.5:1 (axe, 4.34). */}
        <p
          className={cn(
            "flex items-center gap-1.5 truncate text-caption",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {conversation.pinned ? (
            <span className="inline-flex items-center gap-1">
              <PinIcon aria-hidden="true" className="size-3" />
              {t("pinned")}
            </span>
          ) : null}
          {agentName === undefined ? null : (
            <span data-slot="conversation-agent" className="truncate">
              {agentName}
            </span>
          )}
          {conversation.activeRunId === null ? null : <span>{t("answering")}</span>}
          <time dateTime={conversation.lastMessageAt} title={formatDateTime(conversation.lastMessageAt)}>
            {format.relativeTime(new Date(conversation.lastMessageAt), now)}
          </time>
        </p>
      </div>
      {actions}
    </li>
  );
}
