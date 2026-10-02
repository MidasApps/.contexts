"use client";

import type { Conversation } from "@core/contracts";
import { ArchiveIcon, ArchiveRestoreIcon, EllipsisIcon, FileTextIcon, PencilIcon, PinIcon, PinOffIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslations } from "use-intl";
import { ApiError } from "#/shared/api/api-error.ts";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "#/shared/ui/molecules/DropdownMenu/DropdownMenu.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";
import { useConversationActions } from "../model/use-conversation-actions.ts";

export type ConversationActionsMenuProps = {
  organizationId: string;
  conversation: Conversation;
  /** The member chose "rename": the row swaps its title for the rename form. */
  onRename: () => void;
  /** The conversation was deleted (the view leaves it when it is the one on screen). */
  onDeleted?: ((conversationId: string) => void) | undefined;
};

type Summary = { readonly status: "closed" } | { readonly status: "loading" } | { readonly status: "done"; readonly text: string } | { readonly status: "failed"; readonly message: string };

/**
 * The actions of one conversation in the history (SP4 spec §4.1): rename, pin, archive,
 * summarize and delete. Deleting asks first — it removes the messages too. The summary is shown
 * in a dialog as soon as it is asked for (it takes a model call), then stays in the search words.
 */
export function ConversationActionsMenu({ organizationId, conversation, onRename, onDeleted }: ConversationActionsMenuProps) {
  const t = useTranslations("chat.history");
  const describe = useDescribeError();
  const actions = useConversationActions(organizationId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [summary, setSummary] = useState<Summary>({ status: "closed" });
  const title = conversation.title ?? t("untitled");
  // Rename moves the focus into the row's form. The form opens once the menu has closed (its
  // focus scope would take the focus back), and the menu does not return the focus to its trigger.
  const renameAfterClose = useRef(false);

  const remove = useConfirmedAction(
    () => actions.remove(conversation),
    () => {
      notify.success(t("delete.done"));
      onDeleted?.(conversation.id);
    },
  );

  // Pin and archive are locked until their change and the list refresh settle: until then the
  // row still shows the old label, and a second activation would flip it back.
  const [toggling, setToggling] = useState(false);
  const toggle = async (change: (conversation: Conversation) => Promise<void>): Promise<void> => {
    setToggling(true);
    try {
      await change(conversation);
    } finally {
      setToggling(false);
    }
  };

  const summarize = async () => {
    setSummary({ status: "loading" });
    try {
      const summarized = await actions.summarize(conversation);
      setSummary({ status: "done", text: summarized.summary ?? "" });
    } catch (error: unknown) {
      // 409: the conversation has no messages yet.
      const empty = error instanceof ApiError && error.status === 409;
      setSummary({ status: "failed", message: empty ? t("summary.empty") : describe(error).message });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={t("actions.menu", { title })} className="shrink-0">
            <EllipsisIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            if (!renameAfterClose.current) return;
            renameAfterClose.current = false;
            event.preventDefault();
            onRename();
          }}
        >
          <DropdownMenuItem
            onSelect={() => {
              renameAfterClose.current = true;
            }}
          >
            <PencilIcon aria-hidden="true" />
            {t("actions.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={toggling} onSelect={() => void toggle(actions.togglePin)}>
            {conversation.pinned ? <PinOffIcon aria-hidden="true" /> : <PinIcon aria-hidden="true" />}
            {t(conversation.pinned ? "actions.unpin" : "actions.pin")}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={toggling} onSelect={() => void toggle(actions.toggleArchive)}>
            {conversation.archivedAt === null ? <ArchiveIcon aria-hidden="true" /> : <ArchiveRestoreIcon aria-hidden="true" />}
            {t(conversation.archivedAt === null ? "actions.archive" : "actions.restore")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void summarize()}>
            <FileTextIcon aria-hidden="true" />
            {t("actions.summarize")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}>
            <Trash2Icon aria-hidden="true" />
            {t("actions.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!open) remove.reset();
          setConfirmingDelete(open);
        }}
        title={t("delete.title", { title })}
        description={t("delete.description")}
        confirmLabel={t("delete.confirm")}
        destructive
        onConfirm={remove.confirm}
        error={remove.error}
      />
      <Dialog open={summary.status !== "closed"} onOpenChange={(open) => (open ? undefined : setSummary({ status: "closed" }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("summary.title", { title })}</DialogTitle>
            <DialogDescription>{t("summary.description")}</DialogDescription>
          </DialogHeader>
          {summary.status === "loading" ? <LoadingState variant="spinner" label={t("summary.loading")} /> : null}
          {summary.status === "done" ? <p className="text-sm whitespace-pre-wrap text-foreground">{summary.text}</p> : null}
          {summary.status === "failed" ? (
            <p role="alert" className="text-sm text-destructive-text">
              {summary.message}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">{t("summary.close")}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
