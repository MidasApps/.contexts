"use client";

import { CORE_CONTRACTS, type ContractDefinition } from "@core/contracts";
import type { ChatTransport, UIMessage } from "ai";
import { type ReactNode, useEffect, useId, useMemo } from "react";
import { useTranslations } from "use-intl";
import { ASSISTANT_AGENT_ID, agentNameOf, useChatAgents } from "#/entities/chat-agent/index.ts";
import type { UseUploadQueueArgs } from "#/features/chat-upload/index.ts";
import type { ComposerVoiceProps, ReadAloudActionProps } from "#/features/chat-voice/index.ts";
import {
  CORE_UI_COMPONENTS,
  createUiRegistry,
  type UiRegistry,
  type UiRegistryEntry,
} from "#/features/generative-ui/index.ts";
import { ApiError } from "#/shared/api/api-error.ts";
import type { ChatScope } from "#/shared/api/chat-transport.ts";
import { cn } from "#/shared/lib/cn.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { ErrorState } from "#/shared/ui/molecules/ErrorState/ErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { useConversationThread } from "../model/use-conversation-thread.ts";
import { type PanelThread, usePanelThread } from "../model/use-panel-thread.ts";
import { ChatPanelHeader } from "./chat-panel-header.tsx";
import { type ChatSuggestion, ChatThread } from "./chat-thread.tsx";

export type ChatPanelProps = {
  /** Organization (and project) a new conversation belongs to. */
  scope: ChatScope;
  /** The conversation to show; a new one starts when absent. The owner of the URL passes it. */
  conversationId?: string | undefined;
  /** The panel started a conversation (its id) or the member asked for a new one (`undefined`). */
  onConversationChange?: ((conversationId: string | undefined) => void) | undefined;
  /** A turn ended (answered, stopped, failed or lost): the server's view of the conversation changed. */
  onTurnSettled?: (() => void) | undefined;
  /** Quick-start cards of the empty state; defaults to the generic core suggestions. */
  suggestions?: readonly ChatSuggestion[] | undefined;
  /** `false` hides the model's reasoning (tenant setting). */
  showReasoning?: boolean | undefined;
  /** Generative UI components of the installed modules, added to the core ones (decision 0032). */
  uiComponents?: Readonly<Record<string, UiRegistryEntry>> | undefined;
  /** Contracts of the installed modules, so `renderForm` can draw their commands (`modules.contracts()`). */
  contracts?: readonly ContractDefinition[] | undefined;
  /** Href of an approval request in the approvals inbox (the app's router builds it). */
  approvalHref?: ((approvalId: string) => string) | undefined;
  /** Permission check and currency for forms (`can()` and `regional.currency` of the access context). */
  can?: ((permission: string) => boolean) | undefined;
  defaultCurrency?: string | undefined;
  /** Extra composer tools of the host (attachments and voice are the panel's own). */
  tools?: ReactNode;
  /** Host actions in the header, before "new conversation". */
  headerActions?: ReactNode;
  /** Closes the host (the shell's right panel): a close button ends the header. */
  onClose?: (() => void) | undefined;
  className?: string | undefined;
  /** Tests pass a scripted transport, scripted uploads, a fake microphone and fake audio URLs. */
  transport?: ChatTransport<UIMessage> | undefined;
  uploadSeams?: UseUploadQueueArgs["seams"];
  voiceSeams?: ComposerVoiceProps["seams"];
  speechSeams?: ReadAloudActionProps["seams"];
};

const CORE_SUGGESTIONS = ["capabilities", "knowledge", "data", "create"] as const;

type ThreadEnvironment = { readonly uiRegistry: UiRegistry; readonly contracts: readonly ContractDefinition[] };

type StoredThreadProps = {
  thread: PanelThread;
  conversationId: string;
  panel: ChatPanelProps;
  environment: ThreadEnvironment;
  suggestions: readonly ChatSuggestion[];
  assistantName: string | undefined;
  onStarted: (id: string) => void;
  onRecover: () => void;
  /** Starts a new conversation (the way out of a missing one). */
  onNew: () => void;
  /** The stored conversation names its agent once it has loaded. */
  onAgent: (agentId: string) => void;
};

function StoredThread(props: StoredThreadProps) {
  const t = useTranslations("chat");
  const history = useConversationThread({
    organizationId: props.panel.scope.organizationId,
    conversationId: props.conversationId,
    attempt: props.thread.attempt,
  });
  const loadedAgent = history.data?.agentId;
  const { onAgent } = props;
  useEffect(() => {
    if (loadedAgent !== undefined) onAgent(loadedAgent);
  }, [loadedAgent, onAgent]);
  if (history.isPending) return <LoadingState label={t("panel.loadingHistory")} rows={5} className="p-4" />;
  if (history.isError) {
    return (
      <ErrorState
        className="m-4"
        description={t("error.history")}
        requestId={history.error instanceof ApiError ? history.error.requestId : undefined}
        onRetry={() => void history.refetch()}
        retrying={history.isRefetching}
      />
    );
  }
  if (history.data === null) {
    return (
      <EmptyState
        className="m-4"
        icon="message"
        title={t("panel.notFound.title")}
        description={t("panel.notFound.description")}
        action={<Button onClick={props.onNew}>{t("panel.newConversation")}</Button>}
      />
    );
  }
  return (
    <ChatThread
      scope={props.panel.scope}
      conversationId={props.conversationId}
      initialMessages={history.data.messages}
      olderCursor={history.data.olderCursor}
      resume={history.data.resume}
      showReasoning={props.panel.showReasoning}
      assistantName={props.assistantName}
      suggestions={props.suggestions}
      onConversationStarted={props.onStarted}
      onTurnSettled={props.panel.onTurnSettled}
      onRecover={props.onRecover}
      uiRegistry={props.environment.uiRegistry}
      contracts={props.environment.contracts}
      approvalHref={props.panel.approvalHref}
      can={props.panel.can}
      defaultCurrency={props.panel.defaultCurrency}
      tools={props.panel.tools}
      transport={props.panel.transport}
      uploadSeams={props.panel.uploadSeams}
      voiceSeams={props.panel.voiceSeams}
      speechSeams={props.panel.speechSeams}
    />
  );
}

/**
 * The chat widget shared by web and desktop (SP4 spec §5): header, message log, status line and
 * composer, for a new conversation or a stored one (loaded, then resumed when a run is still
 * streaming). It fills its container — the chat view or the shell's right panel — and lays
 * itself out by container width, not viewport.
 */
export function ChatPanel(props: ChatPanelProps) {
  const t = useTranslations("chat");
  const { conversationId, onConversationChange } = props;
  const titleId = useId();
  const { uiComponents, contracts } = props;
  const environment = useMemo<ThreadEnvironment>(
    () => ({
      uiRegistry: createUiRegistry(CORE_UI_COMPONENTS, uiComponents ?? {}),
      contracts: [...CORE_CONTRACTS, ...(contracts ?? [])],
    }),
    [uiComponents, contracts],
  );
  const { thread, agentId, setAgentId, started, startNew, recover } = usePanelThread(
    conversationId,
    onConversationChange,
  );
  const agents = useChatAgents(props.scope.organizationId);
  const knownName = agentNameOf({ agentId, agents: agents.data, assistant: t("agents.assistant") });
  const agentName = knownName ?? t("agents.unknown");
  // Messages carry the agent's own name; the assistant's keep their usual label.
  const assistantName = agentId === ASSISTANT_AGENT_ID ? undefined : agentName;
  const newScope = useMemo(
    () => (agentId === ASSISTANT_AGENT_ID ? props.scope : { ...props.scope, agentId }),
    [agentId, props.scope],
  );

  const suggestions =
    props.suggestions ??
    CORE_SUGGESTIONS.map((id) => ({
      id,
      title: t(`panel.suggestions.${id}.title`),
      description: t(`panel.suggestions.${id}.description`),
      prompt: t(`panel.suggestions.${id}.prompt`),
    }));

  return (
    <section
      data-slot="chat-panel"
      aria-labelledby={titleId}
      className={cn("@container/chat flex h-full min-h-0 flex-col bg-background", props.className)}
    >
      <ChatPanelHeader
        titleId={titleId}
        organizationId={props.scope.organizationId}
        agentId={agentId}
        fixed={thread.conversationId !== undefined}
        agentName={agentName}
        onPick={setAgentId}
        onNew={startNew}
        actions={props.headerActions}
        onClose={props.onClose}
      />
      {thread.storedId === undefined ? (
        <ChatThread
          key={thread.key}
          scope={newScope}
          assistantName={assistantName}
          focusOnMount={thread.fresh}
          showReasoning={props.showReasoning}
          suggestions={suggestions}
          onConversationStarted={started}
          onTurnSettled={props.onTurnSettled}
          onRecover={recover}
          uiRegistry={environment.uiRegistry}
          contracts={environment.contracts}
          approvalHref={props.approvalHref}
          can={props.can}
          defaultCurrency={props.defaultCurrency}
          tools={props.tools}
          transport={props.transport}
          uploadSeams={props.uploadSeams}
          voiceSeams={props.voiceSeams}
          speechSeams={props.speechSeams}
        />
      ) : (
        <StoredThread
          key={thread.key}
          thread={thread}
          conversationId={thread.storedId}
          panel={props}
          environment={environment}
          suggestions={suggestions}
          assistantName={assistantName}
          onStarted={started}
          onRecover={recover}
          onNew={startNew}
          onAgent={setAgentId}
        />
      )}
    </section>
  );
}
