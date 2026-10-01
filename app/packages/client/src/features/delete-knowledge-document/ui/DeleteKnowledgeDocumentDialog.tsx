"use client";

import { deleteKnowledgeDocumentEndpoint, type KnowledgeDocument } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { knowledgeKeys } from "#/entities/knowledge/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

export type DeleteKnowledgeDocumentDialogProps = {
  organizationId: string;
  /** The document to delete; `null` closes the dialog. */
  document: KnowledgeDocument | null;
  /** What the list calls the document (its title, or its source when it has none). */
  name: string;
  onOpenChange: (open: boolean) => void;
};

/**
 * Deletes a knowledge document and its chunks (`DELETE …/knowledge/documents/{id}`,
 * core.knowledge.delete): agents stop citing it. The list is refetched, not patched, because the
 * server also removes the indexed chunks and the row must reflect that it is gone.
 */
export function DeleteKnowledgeDocumentDialog({ organizationId, document, name, onOpenChange }: DeleteKnowledgeDocumentDialogProps) {
  const t = useTranslations("settings.knowledge.delete");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const action = useConfirmedAction(
    async () => {
      if (document === null) return;
      await callEndpoint(deleteKnowledgeDocumentEndpoint, { params: { organizationId, documentId: document.id } });
      await queryClient.invalidateQueries({ queryKey: knowledgeKeys.all(organizationId) });
    },
    () => notify.success(t("done", { name })),
  );
  return (
    <ConfirmDialog
      open={document !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title", { name })}
      description={t("description")}
      confirmLabel={t("confirm")}
      destructive
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
