"use client";

import type { Conversation } from "@core/contracts";
import { PinIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useFormatter, useNow, useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { useFormatDateTime } from "#/shared/lib/format/index.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import type { Route } from "#/shared/lib/router/route-paths.ts";

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
};

/**
 * One row of the conversation history (chat.html §23.5): the title as the link, when it was last
 * used (relative, with the exact time as the tooltip and for screen readers), and what qualifies
 * it in words — pinned, answering now — never an icon or colour alone.
 */
export function ConversationItem({ conversation, to, active = false, editing, actions, onNavigate }: ConversationItemProps) {
  const t = useTranslations("chat.history");
  const format = useFormatter();
  const now = useNow();
  const formatDateTime = useFormatDateTime();
  const title = conversation.title ?? t("untitled");
  return (
    <li data-slot="conversation-item" data-conversation-id={conversation.id} data-active={active} className={cn("group flex items-center gap-1 rounded-sm px-2 py-1.5", active ? "bg-accent" : "hover:bg-accent/60")}>
      <div className="min-w-0 flex-1">
        {editing ?? (
          <RouteLink to={to} onClick={onNavigate} aria-current={active ? "page" : undefined} className="block truncate text-[13px] font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            {title}
          </RouteLink>
        )}
        <p className="flex items-center gap-1.5 truncate text-[11.5px] text-muted-foreground">
          {conversation.pinned ? (
            <span className="inline-flex items-center gap-1">
              <PinIcon aria-hidden="true" className="size-3" />
              {t("pinned")}
            </span>
          ) : null}
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
