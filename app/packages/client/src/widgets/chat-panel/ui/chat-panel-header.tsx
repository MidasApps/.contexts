"use client";

import { SquarePenIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { AgentPicker } from "#/features/chat-agent-picker/index.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";

export type ChatPanelHeaderProps = {
  titleId: string;
  organizationId: string;
  agentId: string;
  /** The conversation exists: its agent is fixed (the server keeps it), so no picker. */
  fixed: boolean;
  agentName: string;
  onPick: (agentId: string) => void;
  onNew: () => void;
  /** Host actions before "new conversation" (the side panel's "open in the chat page"). */
  actions?: ReactNode;
  /** Closes the host (the shell's right panel); the close button goes last. */
  onClose?: (() => void) | undefined;
};

/**
 * The header of the panel: the title, which agent answers — a picker while the conversation is
 * new, its name once it exists — the host's actions, "new conversation" and, in the shell's
 * panel, its close button (last, so opening the panel never lands the focus on it).
 */
export function ChatPanelHeader(props: ChatPanelHeaderProps) {
  const t = useTranslations("chat");
  return (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={props.titleId} className="truncate text-sm font-semibold text-foreground">
          {t("panel.title")}
        </h2>
        {props.fixed ? (
          <p data-slot="conversation-agent" className="truncate text-body-sm text-muted-foreground">
            {t("agents.current", { name: props.agentName })}
          </p>
        ) : (
          <AgentPicker organizationId={props.organizationId} value={props.agentId} onChange={props.onPick} />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {props.actions}
        <Button variant="ghost" size="sm" onClick={props.onNew}>
          <SquarePenIcon aria-hidden="true" />
          {t("panel.newConversation")}
        </Button>
        {props.onClose === undefined ? null : (
          <Button variant="ghost" size="icon-sm" aria-label={t("panel.close")} onClick={props.onClose}>
            <XIcon aria-hidden="true" />
          </Button>
        )}
      </div>
    </header>
  );
}
