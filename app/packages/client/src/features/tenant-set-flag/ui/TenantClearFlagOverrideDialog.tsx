"use client";

import { clearTenantFlagEndpoint, type FeatureFlag } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { tenantFlagKeys } from "#/entities/feature-flag/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { useFlagLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

export type TenantClearFlagOverrideDialogProps = { organizationId: string; flag: FeatureFlag | null; onOpenChange: (open: boolean) => void };

/**
 * Confirms and removes the organization's own override of a flag
 * (`DELETE /v1/flags/{flagKey}?organizationId=`, core.flag.write; decision 0066), so the
 * organization follows the platform value again, on or off. A failure stays in the dialog with
 * the request reference.
 */
export function TenantClearFlagOverrideDialog({ organizationId, flag, onOpenChange }: TenantClearFlagOverrideDialogProps) {
  const t = useTranslations("settings.flags.clear");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const label = useFlagLabel();
  const key = flag === null ? "" : label.name(flag.key);
  const action = useConfirmedAction(
    async () => {
      if (flag === null) return;
      await callEndpoint(clearTenantFlagEndpoint, { params: { flagKey: flag.key }, query: { organizationId } });
      await queryClient.invalidateQueries({ queryKey: tenantFlagKeys.list(organizationId) });
    },
    () => notify.success(t("done", { key })),
  );
  return (
    <ConfirmDialog
      open={flag !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title", { key })}
      description={t("description", { reason: flag === null ? "" : label.description(flag.key, flag.reason) })}
      confirmLabel={t("confirm")}
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
