"use client";

import { adminClearFlagOverrideEndpoint, type FeatureFlag } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { featureFlagKeys } from "#/entities/feature-flag/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

/** The override staff asked to remove: one flag for one organization. */
export type FlagOverrideTarget = {
  readonly flag: FeatureFlag;
  readonly organization: { readonly id: string; readonly name: string };
};

export type ClearFlagOverrideDialogProps = { target: FlagOverrideTarget | null; onOpenChange: (open: boolean) => void };

/**
 * Confirms and removes an organization's override of a flag
 * (`DELETE /v1/admin/flags/{flagKey}/overrides/{organizationId}`, platform.flag.manage; audited
 * with `targetTenantId`), so the organization follows the environment value again. The list keeps
 * the override until the API accepts the removal; a failure stays in the dialog with the request
 * reference.
 */
export function ClearFlagOverrideDialog({ target, onOpenChange }: ClearFlagOverrideDialogProps) {
  const t = useTranslations("admin.flags.clear");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const key = target?.flag.key ?? "";
  const action = useConfirmedAction(
    async () => {
      if (target === null) return;
      await callEndpoint(adminClearFlagOverrideEndpoint, { params: { flagKey: target.flag.key, organizationId: target.organization.id } });
      await queryClient.invalidateQueries({ queryKey: featureFlagKeys.all() });
    },
    () => notify.success(t("done", { key })),
  );
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title", { key })}
      description={t("description", { name: target?.organization.name ?? "", reason: target?.flag.reason ?? "" })}
      confirmLabel={t("confirm")}
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
