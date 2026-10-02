"use client";

import { createPlanEndpoint, updatePlanEndpoint, type Plan } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslations } from "use-intl";
import { adminOrganizationKeys } from "#/entities/admin-organization/index.ts";
import { planKeys } from "#/entities/plan/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { useDialogDismissGuard } from "#/shared/ui/molecules/Dialog/dialog-dismiss-guard.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { SchemaForm } from "#/shared/ui/organisms/SchemaForm/SchemaForm.tsx";
import type { SchemaFormResult } from "#/shared/ui/organisms/SchemaForm/server-errors.ts";
import { PlanFormContract, planFormDefaults, toUpsertPlanInput, type PlanForm } from "../model/plan-form.contract.ts";

export type PlanFormDialogProps = {
  /** `null` creates a plan; a plan edits it (a replace: `PUT`). */
  plan: Plan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** The plan form inside the dialog: Esc, outside click or X ask before dropping edited values. */
function GuardedPlanForm({ plan, submit }: { plan: Plan | null; submit: (values: PlanForm) => Promise<SchemaFormResult> }) {
  const [dirty, setDirty] = useState(false);
  useDialogDismissGuard(dirty ? "confirmUnsaved" : "allow");
  return (
    <SchemaForm
      contract={PlanFormContract}
      defaultValues={planFormDefaults(plan)}
      defaultCurrency="USD"
      onSubmit={submit}
      onDirtyChange={setDirty}
      submitLabelKey={plan === null ? "admin.plans.form.createSubmit" : "admin.plans.form.editSubmit"}
      successMessageKey="admin.plans.form.savedStatus"
    />
  );
}

/**
 * Creates or replaces a plan (staff, platform.plan.manage; audited). Replacing a plan moves the
 * budget of every organization on it, so the dialog says so before saving. Focus returns to
 * whatever opened it.
 */
export function PlanFormDialog({ plan, open, onOpenChange }: PlanFormDialogProps) {
  const t = useTranslations("admin.plans.form");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const returnFocus = useRef<HTMLElement | null>(null);

  const submit = async (values: PlanForm): Promise<SchemaFormResult> => {
    const body = toUpsertPlanInput(values);
    let saved: Plan;
    try {
      saved = plan === null ? (await callEndpoint(createPlanEndpoint, { body })).data : (await callEndpoint(updatePlanEndpoint, { params: { planId: plan.id }, body })).data;
    } catch (error: unknown) {
      if (error instanceof ApiError) return { ok: false, error };
      throw error;
    }
    // A plan change re-materializes the budgets of its organizations (decision 0039).
    await Promise.all([queryClient.invalidateQueries({ queryKey: planKeys.all() }), queryClient.invalidateQueries({ queryKey: adminOrganizationKeys.all() })]);
    notify.success(plan === null ? t("created", { name: saved.name }) : t("updated", { name: saved.name }));
    onOpenChange(false);
    return { ok: true };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={() => {
          returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocus.current === null || !returnFocus.current.isConnected) return;
          event.preventDefault();
          returnFocus.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{plan === null ? t("createTitle") : t("editTitle", { name: plan.name })}</DialogTitle>
          <DialogDescription>{plan === null ? t("createDescription") : t("editDescription")}</DialogDescription>
        </DialogHeader>
        <GuardedPlanForm key={plan?.id ?? "new"} plan={plan} submit={submit} />
      </DialogContent>
    </Dialog>
  );
}
