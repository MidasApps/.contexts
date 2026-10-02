"use client";

import { MessageSquareShareIcon, XIcon } from "lucide-react";
import { useTranslations } from "use-intl";
import type { NodeParams } from "#/shared/api/core-queries.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { useCurrentNode } from "#/shared/lib/session/use-current-node.ts";
import { useShellUi } from "#/shared/lib/shell/shell-ui-context.tsx";
import type { RightPanelProps, ShellSlots } from "#/shared/lib/shell/shell-types.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { useChatEnvironment, useChatSidePanelAvailable } from "../model/use-chat-environment.ts";
import { ChatPanel, type ChatPanelProps } from "./chat-panel.tsx";

export type ProjectChatPanelProps = Pick<
  ChatPanelProps,
  "conversationId" | "onConversationChange" | "onTurnSettled" | "className" | "transport" | "headerActions" | "onClose"
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

/** "Open in the chat page": the conversation of the side panel, with its history beside it. */
function OpenInChatLink({
  place,
  onOpen,
}: {
  place: { organizationId: string; projectId: string; conversationId: string };
  onOpen: () => void;
}) {
  const t = useTranslations("chat.panel");
  return (
    <Button variant="ghost" size="icon-sm" asChild>
      <RouteLink
        to={{
          id: "chat",
          organizationId: place.organizationId,
          projectId: place.projectId,
          conversationId: place.conversationId,
        }}
        aria-label={t("openInChat")}
        onClick={onOpen}
      >
        <MessageSquareShareIcon aria-hidden="true" />
      </RouteLink>
    </Button>
  );
}

/** Below `lg` the panel is a sheet without a corner X: even the empty state carries a close. */
function NoProjectPanel({ onClose }: RightPanelProps) {
  const t = useTranslations("shell.rightPanel");
  const tPanel = useTranslations("chat.panel");
  return (
    <div className="flex w-full flex-col">
      <div className="flex justify-end px-2 pt-2">
        <Button variant="ghost" size="icon-sm" aria-label={tPanel("close")} onClick={onClose}>
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      <EmptyState frame="plain" icon="message" className="m-4 flex-1" title={t("chatUnavailable")} />
    </div>
  );
}

/** The conversation the side panel holds at a project, kept while the panel is closed (decision 0048). */
const useSidePanelConversation = (key: string) => {
  const conversationId = useShellUi((state) => state.rightPanel[key]);
  const remember = useShellUi((state) => state.rememberRightPanel);
  return { conversationId, remember: (next: string | undefined) => remember(key, next) };
};

/**
 * The shell's right panel (SP2 slot, SP4 Task 13): a chat for the project in the URL. It keeps the
 * conversation it started while it is closed (per project), offers to open it on the chat page,
 * and closes itself from its header.
 */
export function ChatSidePanel({ onClose }: RightPanelProps) {
  const node = useCurrentNode();
  if (node?.projectId === undefined) return <NoProjectPanel onClose={onClose} />;
  return (
    <ProjectSidePanel
      key={`${node.organizationId}:${node.projectId}`}
      organizationId={node.organizationId}
      projectId={node.projectId}
      onClose={onClose}
    />
  );
}

function ProjectSidePanel({
  organizationId,
  projectId,
  onClose,
}: {
  organizationId: string;
  projectId: string;
  onClose: () => void;
}) {
  const kept = useSidePanelConversation(`${organizationId}:${projectId}`);
  const { conversationId } = kept;
  return (
    <ProjectChatPanel
      organizationId={organizationId}
      projectId={projectId}
      conversationId={conversationId}
      onConversationChange={kept.remember}
      onClose={onClose}
      headerActions={
        conversationId === undefined ? null : (
          <OpenInChatLink place={{ organizationId, projectId, conversationId }} onOpen={onClose} />
        )
      }
      className="w-full bg-card"
    />
  );
}

/** What the apps pass to `createClientApp({ slots })` to mount the chat in the shell's right panel. */
export const CHAT_SHELL_SLOTS: ShellSlots = {
  rightPanel: ChatSidePanel,
  useRightPanelAvailable: useChatSidePanelAvailable,
};
