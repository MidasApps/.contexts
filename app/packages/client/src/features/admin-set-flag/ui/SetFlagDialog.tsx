"use client";

import { adminSetFlagEndpoint, type FeatureFlag } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { featureFlagKeys } from "#/entities/feature-flag/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { useFlagLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

/** A value staff asked for: the environment's, or one organization's override. */
export type FlagChange = {
  readonly flag: FeatureFlag;
  readonly value: boolean;
  /** Set = override for this organization; absent = the environment value. */
  readonly organization?: { readonly id: string; readonly name: string } | undefined;
};

export type SetFlagDialogProps = { change: FlagChange | null; onOpenChange: (open: boolean) => void };

/**
 * Confirms and sets a flag (`PUT /v1/admin/flags/{flagKey}`, platform.flag.manage; audited with
 * `targetTenantId`). Switching a kill-switch on is a destructive confirmation that quotes what
 * the flag stops. The list keeps the old value until the API accepts the change; a failure stays
 * in the dialog with the request reference.
 */
export function SetFlagDialog({ change, onOpenChange }: SetFlagDialogProps) {
  const t = useTranslations("admin.flags.confirm");
  const label = useFlagLabel();
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const action = useConfirmedAction(
    async () => {
      if (change === null) return;
      const body =
        change.organization === undefined
          ? { value: change.value }
          : { value: change.value, tenantId: change.organization.id };
      await callEndpoint(adminSetFlagEndpoint, { params: { flagKey: change.flag.key }, body });
      await queryClient.invalidateQueries({ queryKey: featureFlagKeys.all() });
    },
    () => notify.success(t(change?.value === true ? "doneOn" : "doneOff", { key: change?.flag.key ?? "" })),
  );
  const key = change?.flag.key ?? "";
  const state = change?.value === true ? "on" : "off";
  const destructive = change?.flag.kind === "kill-switch" && change.value;
  // The flag's description in the page language; the registry's English reason is the fallback (follow-up 85).
  const reason = change === null ? "" : label.description(change.flag.key, change.flag.reason);
  const organization = change?.organization;
  const description =
    organization === undefined
      ? t(destructive ? "killSwitchEnvironment" : "descriptionEnvironment", { reason })
      : t(destructive ? "killSwitchOrganization" : "descriptionOrganization", { reason, name: organization.name });
  return (
    <ConfirmDialog
      open={change !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t(state === "on" ? "titleOn" : "titleOff", { key })}
      description={description}
      confirmLabel={t(state === "on" ? "confirmOn" : "confirmOff")}
      destructive={destructive}
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
