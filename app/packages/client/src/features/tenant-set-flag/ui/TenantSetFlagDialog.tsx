"use client";

import { setTenantFlagEndpoint, type FeatureFlag } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { tenantFlagKeys } from "#/entities/feature-flag/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

/** `false` switches the feature off for the organization; `true` goes back to using it. */
export type TenantFlagChange = { readonly flag: FeatureFlag; readonly value: boolean };

export type TenantSetFlagDialogProps = { organizationId: string; change: TenantFlagChange | null; onOpenChange: (open: boolean) => void };

/**
 * Confirms and sets the organization's override of a flag (`PUT /v1/flags/{flagKey}?organizationId=`,
 * core.flag.write). An organization can only switch a feature off for itself, or stop doing so;
 * the API refuses to enable what the platform disables (400), and that refusal stays in the dialog.
 */
export function TenantSetFlagDialog({ organizationId, change, onOpenChange }: TenantSetFlagDialogProps) {
  const t = useTranslations("settings.flags.confirm");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const action = useConfirmedAction(
    async () => {
      if (change === null) return;
      await callEndpoint(setTenantFlagEndpoint, { params: { flagKey: change.flag.key }, query: { organizationId }, body: { value: change.value } });
      await queryClient.invalidateQueries({ queryKey: tenantFlagKeys.list(organizationId) });
    },
    () => notify.success(t(change?.value === true ? "doneOn" : "doneOff", { key: change?.flag.key ?? "" })),
  );
  const key = change?.flag.key ?? "";
  const off = change?.value === false;
  return (
    <ConfirmDialog
      open={change !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t(off ? "titleOff" : "titleOn", { key })}
      description={t(off ? "descriptionOff" : "descriptionOn", { reason: change?.flag.reason ?? "" })}
      confirmLabel={t(off ? "confirmOff" : "confirmOn")}
      destructive={off}
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
