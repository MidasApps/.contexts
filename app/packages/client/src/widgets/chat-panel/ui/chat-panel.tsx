"use client";

import { CORE_CONTRACTS, type ContractDefinition } from "@core/contracts";
import type { ChatTransport, UIMessage } from "ai";
import { SquarePenIcon } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import type { UseUploadQueueArgs } from "#/features/chat-upload/index.ts";
import type { ComposerVoiceProps, ReadAloudActionProps } from "#/features/chat-voice/index.ts";
import { CORE_UI_COMPONENTS, createUiRegistry, type UiRegistry, type UiRegistryEntry } from "#/features/generative-ui/index.ts";
import { ApiError } from "#/shared/api/api-error.ts";
import type { ChatScope } from "#/shared/api/chat-transport.ts";
import { cn } from "#/shared/lib/cn.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { ErrorState } from "#/shared/ui/molecules/ErrorState/ErrorState.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { useConversationThread } from "../model/use-conversation-thread.ts";
import { ChatThread, type ChatSuggestion } from "./chat-thread.tsx";

export type ChatPanelProps = {
  /** Organization (and project) a new conversation belongs to. */
  scope: ChatScope;
  /** The conversation to show; a new one starts when absent. The owner of the URL passes it. */
  conversationId?: string | undefined;
  /** The panel started a conversation (its id) or the member asked for a new one (`undefined`). */
  onConversationChange?: ((conversationId: string | undefined) => void) | undefined;
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
  className?: string | undefined;
  /** Tests pass a scripted transport, scripted uploads, a fake microphone and fake audio URLs. */
  transport?: ChatTransport<UIMessage> | undefined;
  uploadSeams?: UseUploadQueueArgs["seams"];
  voiceSeams?: ComposerVoiceProps["seams"];
  speechSeams?: ReadAloudActionProps["seams"];
};

/**
 * Which conversation is on screen. `key` remounts the thread; adopting the id the server gave a
 * new conversation does not. `storedId` is the conversation the thread loads when it mounts.
 */
type Thread = {
  readonly key: number;
  readonly conversationId: string | undefined;
  readonly storedId: string | undefined;
  /** Last `conversationId` prop seen, to tell "the owner navigated" from "the owner caught up". */
  readonly prop: string | undefined;
  /** The member asked for a new conversation: the composer takes the focus. */
  readonly fresh: boolean;
  readonly attempt: number;
};

const threadFor = (key: number, conversationId: string | undefined): Thread => ({ key, conversationId, storedId: conversationId, prop: conversationId, fresh: false, attempt: 0 });

const CORE_SUGGESTIONS = ["capabilities", "knowledge", "data", "create"] as const;

type ThreadEnvironment = { readonly uiRegistry: UiRegistry; readonly contracts: readonly ContractDefinition[] };

function StoredThread(props: { thread: Thread; conversationId: string; panel: ChatPanelProps; environment: ThreadEnvironment; suggestions: readonly ChatSuggestion[]; onStarted: (id: string) => void; onRecover: () => void }) {
  const t = useTranslations("chat");
  const history = useConversationThread({ organizationId: props.panel.scope.organizationId, conversationId: props.conversationId, attempt: props.thread.attempt });
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
  if (history.data === null) return <EmptyState className="m-4" icon="message" title={t("panel.notFound.title")} description={t("panel.notFound.description")} />;
  return (
    <ChatThread
      scope={props.panel.scope}
      conversationId={props.conversationId}
      initialMessages={history.data.messages}
      olderCursor={history.data.olderCursor}
      resume={history.data.resume}
      showReasoning={props.panel.showReasoning}
      suggestions={props.suggestions}
      onConversationStarted={props.onStarted}
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
    () => ({ uiRegistry: createUiRegistry(CORE_UI_COMPONENTS, uiComponents ?? {}), contracts: [...CORE_CONTRACTS, ...(contracts ?? [])] }),
    [uiComponents, contracts],
  );
  const [thread, setThread] = useState<Thread>(() => threadFor(0, conversationId));

  // The owner of the URL moved to another conversation: start that thread. When it only caught
  // up with the id this thread got from the server, nothing remounts (the answer is streaming).
  if (conversationId !== thread.prop) {
    setThread(conversationId === thread.conversationId ? { ...thread, prop: conversationId } : threadFor(thread.key + 1, conversationId));
  }

  const started = (id: string) => {
    setThread((current) => ({ ...current, conversationId: id }));
    onConversationChange?.(id);
  };

  const startNew = () => {
    setThread((current) => ({ ...threadFor(current.key + 1, undefined), prop: current.prop, fresh: true }));
    onConversationChange?.(undefined);
  };

  const recover = () => setThread((current) => ({ ...current, key: current.key + 1, storedId: current.conversationId, fresh: false, attempt: current.attempt + 1 }));

  const suggestions = props.suggestions ?? CORE_SUGGESTIONS.map((id) => ({ id, title: t(`panel.suggestions.${id}.title`), description: t(`panel.suggestions.${id}.description`), prompt: t(`panel.suggestions.${id}.prompt`) }));

  return (
    <section data-slot="chat-panel" aria-labelledby={titleId} className={cn("@container/chat flex h-full min-h-0 flex-col bg-background", props.className)}>
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <h2 id={titleId} className="truncate text-sm font-semibold text-foreground">
          {t("panel.title")}
        </h2>
        <Button variant="ghost" size="sm" onClick={startNew}>
          <SquarePenIcon aria-hidden="true" />
          {t("panel.newConversation")}
        </Button>
      </header>
      {thread.storedId === undefined ? (
        <ChatThread
          key={thread.key}
          scope={props.scope}
          focusOnMount={thread.fresh}
          showReasoning={props.showReasoning}
          suggestions={suggestions}
          onConversationStarted={started}
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
        <StoredThread key={thread.key} thread={thread} conversationId={thread.storedId} panel={props} environment={environment} suggestions={suggestions} onStarted={started} onRecover={recover} />
      )}
    </section>
  );
}
