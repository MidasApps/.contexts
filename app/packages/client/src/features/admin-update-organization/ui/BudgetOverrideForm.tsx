"use client";

import type { OrganizationAdminSummary } from "@core/contracts";
import type { MoneyValue } from "@core/i18n";
import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { useAsyncAction } from "#/shared/lib/errors/use-async-action.ts";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { microUsdToMoney, moneyToMicroUsd } from "#/shared/lib/format/use-format-micro-usd.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { MoneyInput } from "#/shared/ui/molecules/MoneyInput/MoneyInput.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";
import { useOrganizationWrites } from "../model/use-organization-writes.ts";

const TOKENS = /^\d{1,15}$/u;

type FieldErrors = { money?: string; tokens?: string };

/** "Back to the plan": clears the staff override behind a confirmation. */
function ClearOverride({ organization, disabled }: { organization: OrganizationAdminSummary; disabled: boolean }) {
  const t = useTranslations("admin.organizationDetail.budget");
  const [open, setOpen] = useState(false);
  const writes = useOrganizationWrites(organization.id);
  const action = useConfirmedAction(
    async () => void (await writes.setBudget(null)),
    () => notify.success(t("cleared", { name: organization.name })),
  );
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={disabled}>
        {t("clear")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) action.reset();
          setOpen(next);
        }}
        title={t("clearTitle", { name: organization.name })}
        description={t("clearDescription")}
        confirmLabel={t("clearConfirm")}
        destructive
        onConfirm={action.confirm}
        error={action.error}
      />
    </>
  );
}

/**
 * Staff budget override of one organization: a monthly spend cap in dollars (sent as micro-USD)
 * and a monthly token cap that replace the plan's. Starts from the override in force, else from
 * the caps in force, so staff adjust what they see.
 */
export function BudgetOverrideForm({ organization }: { organization: OrganizationAdminSummary }) {
  const t = useTranslations("admin.organizationDetail.budget");
  const online = useOnlineStatus();
  const ids = { money: useId(), tokens: useId(), moneyError: useId(), tokensError: useId() };
  const start = organization.budget.override ?? organization.budget.caps;
  const [money, setMoney] = useState<MoneyValue | null>(() => microUsdToMoney(start.monthlyMicroUsd));
  const [moneyInvalid, setMoneyInvalid] = useState(false);
  const [tokens, setTokens] = useState(String(start.monthlyTokens));
  const [errors, setErrors] = useState<FieldErrors>({});
  const writes = useOrganizationWrites(organization.id);
  const save = useAsyncAction();

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const next: FieldErrors = {
      ...(money === null || moneyInvalid ? { money: t("moneyError") } : {}),
      ...(TOKENS.test(tokens.trim()) ? {} : { tokens: t("tokensError") }),
    };
    setErrors(next);
    if (money === null || Object.keys(next).length > 0) return;
    const override = { monthlyMicroUsd: moneyToMicroUsd(money), monthlyTokens: Number(tokens.trim()) };
    const ok = await save.run(async () => void (await writes.setBudget(override)));
    if (ok) notify.success(t("saved", { name: organization.name }));
  };

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.money}>{t("money")}</Label>
          <MoneyInput
            id={ids.money}
            value={money}
            currency="USD"
            onValueChange={setMoney}
            onParseError={(error) => setMoneyInvalid(error !== null)}
            aria-invalid={errors.money !== undefined}
            aria-describedby={errors.money === undefined ? undefined : ids.moneyError}
          />
          {errors.money === undefined ? null : (
            <p id={ids.moneyError} className="text-sm font-medium text-destructive-text">
              {errors.money}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.tokens}>{t("tokens")}</Label>
          <Input
            id={ids.tokens}
            inputMode="numeric"
            className="text-right font-mono tabular-nums"
            value={tokens}
            onChange={(event) => setTokens(event.target.value)}
            aria-invalid={errors.tokens !== undefined}
            aria-describedby={errors.tokens === undefined ? undefined : ids.tokensError}
          />
          {errors.tokens === undefined ? null : (
            <p id={ids.tokensError} className="text-sm font-medium text-destructive-text">
              {errors.tokens}
            </p>
          )}
        </div>
      </div>
      {save.error === undefined ? null : (
        <p role="alert" className="text-sm font-medium text-destructive-text">
          {save.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={save.pending} disabled={!online}>
          {t("save")}
        </Button>
        {organization.budget.override === null ? null : <ClearOverride organization={organization} disabled={!online || save.pending} />}
      </div>
    </form>
  );
}
