"use client";

import { useTranslations } from "use-intl";
import type { NodeParams } from "#/shared/api/core-queries.ts";
import { useCurrentNode } from "#/shared/lib/session/use-current-node.ts";
import type { ShellSlots } from "#/shared/lib/shell/shell-types.ts";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { useChatEnvironment, useChatSidePanelAvailable } from "../model/use-chat-environment.ts";
import { ChatPanel, type ChatPanelProps } from "./chat-panel.tsx";

export type ProjectChatPanelProps = Pick<
  ChatPanelProps,
  "conversationId" | "onConversationChange" | "onTurnSettled" | "className" | "transport"
> & {
  organizationId: string;
  projectId: string;
};

/**
 * The chat panel wired to the app at a project: scope, permissions, module contracts (so forms of
 * module commands render instead of the generic tool view), currency and the approvals link.
 * The chat view and the shell's right panel both mount this one.
 */
export function ProjectChatPanel({ organizationId, projectId, ...panel }: ProjectChatPanelProps) {
  const node: NodeParams = { organizationId, projectId };
  const environment = useChatEnvironment(node);
  return (
    <ChatPanel
      scope={node}
      can={environment.can}
      contracts={environment.contracts}
      defaultCurrency={environment.defaultCurrency}
      approvalHref={environment.approvalHref}
      {...panel}
    />
  );
}

/**
 * The shell's right panel (SP2 slot, SP4 Task 13): a chat for the project in the URL. A new
 * conversation each time the project changes; the history lives on the chat page.
 */
export function ChatSidePanel() {
  const t = useTranslations("shell.rightPanel");
  const node = useCurrentNode();
  if (node?.projectId === undefined)
    return <EmptyState frame="plain" icon="message" className="m-4 flex-1" title={t("chatUnavailable")} />;
  return (
    <ProjectChatPanel
      key={`${node.organizationId}:${node.projectId}`}
      organizationId={node.organizationId}
      projectId={node.projectId}
      className="w-full bg-card"
    />
  );
}

/** What the apps pass to `createClientApp({ slots })` to mount the chat in the shell's right panel. */
export const CHAT_SHELL_SLOTS: ShellSlots = {
  rightPanel: ChatSidePanel,
  useRightPanelAvailable: useChatSidePanelAvailable,
};
