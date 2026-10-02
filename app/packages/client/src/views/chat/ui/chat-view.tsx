"use client";

import { useQueryClient } from "@tanstack/react-query";
import { HistoryIcon } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { conversationListsKey } from "#/entities/conversation/index.ts";
import { usePermissions } from "#/entities/permission/index.ts";
import { BREAKPOINTS, useMediaQuery } from "#/shared/lib/media/use-media-query.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "#/shared/ui/molecules/Sheet/Sheet.tsx";
import { ChatHistorySidebar } from "#/widgets/chat-history-sidebar/index.ts";
import { CHAT_PERMISSION, ProjectChatPanel } from "#/widgets/chat-panel/index.ts";
import { PageError, PageForbidden, PageNotFound } from "#/widgets/page-state/index.ts";

type ChatPlace = {
  readonly organizationId: string;
  readonly projectId: string;
  readonly conversationId: string | undefined;
};

function ChatWorkspace({ place }: { place: ChatPlace }) {
  const t = useTranslations("chat.view");
  const router = useRouter();
  const queryClient = useQueryClient();
  const compact = useMediaQuery(`(max-width: ${BREAKPOINTS.lg - 1}px)`);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { organizationId, projectId, conversationId } = place;

  const refreshHistory = () => void queryClient.invalidateQueries({ queryKey: conversationListsKey(organizationId) });

  // The panel named a new conversation (or the member asked for a new one): the URL follows, so
  // a reload or a shared link opens the same thread, and the history shows the new row. Naming
  // the conversation is the same page under its lasting address: the thread on screen is
  // streaming its first answer and must not be built again.
  const onConversationChange = (next: string | undefined) => {
    router.navigate(
      { id: "chat", organizationId, projectId, conversationId: next },
      next === undefined ? undefined : { replace: true, samePage: true },
    );
    refreshHistory();
  };

  const onDeleted = (deleted: string) => {
    if (deleted === conversationId) router.navigate({ id: "chat", organizationId, projectId }, { replace: true });
  };

  const history = (
    <ChatHistorySidebar
      organizationId={organizationId}
      projectId={projectId}
      activeConversationId={conversationId}
      onNavigate={() => setHistoryOpen(false)}
      onDeleted={onDeleted}
      onClose={compact ? () => setHistoryOpen(false) : undefined}
      className={compact ? undefined : "w-[280px] shrink-0 border-r border-border"}
    />
  );

  return (
    // Viewport minus the topbar, the main padding and the shell banners (offline, support access).
    <div
      data-slot="chat-view"
      className="flex h-[calc(100svh_-_6.5rem_-_var(--shell-banners-height,0px))] min-h-[420px] flex-col lg:h-[calc(100svh_-_7.5rem_-_var(--shell-banners-height,0px))]"
    >
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        {compact ? (
          <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(true)}>
            <HistoryIcon aria-hidden="true" />
            {t("openHistory")}
          </Button>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        {compact ? null : history}
        <ProjectChatPanel
          organizationId={organizationId}
          projectId={projectId}
          conversationId={conversationId}
          onConversationChange={onConversationChange}
          onTurnSettled={refreshHistory}
          className="min-w-0 flex-1"
        />
      </div>
      {compact ? (
        <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
          <SheetContent side="left" showCloseButton={false} className="w-full p-0 sm:max-w-[320px]">
            <SheetHeader className="sr-only">
              <SheetTitle>{t("historyPanel")}</SheetTitle>
              <SheetDescription>{t("historyPanel")}</SheetDescription>
            </SheetHeader>
            {history}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}

/**
 * `/o/:organizationId/p/:projectId/chat/:conversationId?` (SP4 spec §5, Task 13): the chat of a
 * project — the conversation history beside the chat panel (a sheet below `lg`). The conversation
 * is URL state. Without `core.conversation.send` at the project the page is forbidden; the API
 * authorizes every call again.
 */
export function ChatView() {
  const t = useTranslations("chat.view");
  const params = useRouter().useRouteParams();
  const permissions = usePermissions();
  const organizationId = params["organizationId"] ?? "";
  const projectId = params["projectId"] ?? "";
  if (organizationId === "" || projectId === "") return <PageNotFound />;
  if (permissions.status === "pending") return <LoadingState label={t("loading")} rows={6} />;
  if (permissions.status === "error") return <PageError error={permissions.error} onRetry={permissions.refetch} />;
  if (!permissions.can(CHAT_PERMISSION)) return <PageForbidden />;
  const conversationId = params["conversationId"];
  return (
    <ChatWorkspace
      place={{ organizationId, projectId, conversationId: conversationId === "" ? undefined : conversationId }}
    />
  );
}
