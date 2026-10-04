"use client";

import { type ApiKey, revokeApiKeyEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { apiKeyKeys } from "#/entities/api-key/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { patchCachedLists } from "#/shared/api/optimistic-list.ts";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

export type RevokeApiKeyDialogProps = {
  organizationId: string;
  apiKey: ApiKey | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Revokes an API key (`DELETE /v1/api-keys/{id}`, core.api-key.revoke): integrations using it
 * start answering 401 at once. The row shows `revoked` immediately and rolls back on failure.
 */
export function RevokeApiKeyDialog({ organizationId, apiKey, onOpenChange }: RevokeApiKeyDialogProps) {
  const t = useTranslations("settings.apiKeys.revoke");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const revoke = async (target: ApiKey): Promise<void> => {
    const rollback = await patchCachedLists<ApiKey>(queryClient, apiKeyKeys.all(organizationId), (items) =>
      items.map((item) => (item.id === target.id ? { ...item, status: "revoked", revokedReason: "revoked" } : item)),
    );
    try {
      await callEndpoint(revokeApiKeyEndpoint, { params: { apiKeyId: target.id } });
    } catch (error: unknown) {
      rollback();
      throw error;
    } finally {
      void queryClient.invalidateQueries({ queryKey: apiKeyKeys.all(organizationId) });
    }
  };
  const action = useConfirmedAction(
    () => (apiKey === null ? Promise.resolve() : revoke(apiKey)),
    () => notify.success(t("done", { name: apiKey?.name ?? "" })),
  );
  return (
    <ConfirmDialog
      open={apiKey !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title", { name: apiKey?.name ?? "" })}
      description={t("description")}
      confirmLabel={t("confirm")}
      destructive
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
