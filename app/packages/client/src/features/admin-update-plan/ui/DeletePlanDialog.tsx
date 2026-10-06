"use client";

import { deletePlanEndpoint, type Plan } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { planKeys } from "#/entities/plan/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

export type DeletePlanDialogProps = {
  /** The plan to delete; `null` closes the dialog. */
  plan: Plan | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Deletes a plan (`DELETE /v1/admin/plans/{id}`, platform.plan.manage). The API refuses a plan
 * organizations are still on (`PLAN_IN_USE`); the dialog stays open and says so.
 */
export function DeletePlanDialog({ plan, onOpenChange }: DeletePlanDialogProps) {
  const t = useTranslations("admin.plans.delete");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const name = plan?.name ?? "";
  const action = useConfirmedAction(
    async () => {
      if (plan === null) return;
      await callEndpoint(deletePlanEndpoint, { params: { planId: plan.id } });
      await queryClient.invalidateQueries({ queryKey: planKeys.all() });
    },
    () => notify.success(t("done", { name })),
  );
  return (
    <ConfirmDialog
      open={plan !== null}
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
