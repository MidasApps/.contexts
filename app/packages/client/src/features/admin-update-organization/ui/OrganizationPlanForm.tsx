"use client";

import type { OrganizationAdminSummary, Plan } from "@core/contracts";
import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { useAsyncAction } from "#/shared/lib/errors/use-async-action.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { useOrganizationWrites } from "../model/use-organization-writes.ts";

/** Select value of "no plan" (plan ids are Firestore ids, never this text). */
const DEFAULT_PLAN = "__default__";

export type OrganizationPlanFormProps = { organization: OrganizationAdminSummary; plans: readonly Plan[] };

/**
 * Assigns a plan to an organization, or the platform default (`planId: null`). The budget follows
 * the plan unless staff set an override, which the description says.
 */
export function OrganizationPlanForm({ organization, plans }: OrganizationPlanFormProps) {
  const t = useTranslations("admin.organizationDetail.plan");
  const online = useOnlineStatus();
  const selectId = useId();
  const errorId = useId();
  const writes = useOrganizationWrites(organization.id);
  const save = useAsyncAction();
  const current = organization.planId ?? DEFAULT_PLAN;
  const [selected, setSelected] = useState(current);
  // A plan removed from the catalog still shows as the current choice.
  const unknownCurrent = organization.planId !== null && !plans.some((plan) => plan.id === organization.planId);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const planId = selected === DEFAULT_PLAN ? null : selected;
    const ok = await save.run(async () => void (await writes.update({ planId })));
    if (ok) notify.success(t("saved", { name: organization.name }));
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={selectId}>{t("label")}</Label>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger id={selectId} className="w-full sm:w-72" aria-describedby={save.error === undefined ? undefined : errorId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_PLAN}>{t("default")}</SelectItem>
            {unknownCurrent && organization.planId !== null ? <SelectItem value={organization.planId}>{organization.planId}</SelectItem> : null}
            {plans.map((plan) => (
              <SelectItem key={plan.id} value={plan.id}>
                {plan.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </div>
      {save.error === undefined ? null : (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive-text">
          {save.error}
        </p>
      )}
      <div>
        <Button type="submit" pending={save.pending} disabled={!online || selected === current}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
