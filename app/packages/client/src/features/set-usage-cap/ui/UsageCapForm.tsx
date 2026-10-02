"use client";

import { updateAgentSettingsEndpoint, type BudgetCaps } from "@core/contracts";
import type { MoneyValue } from "@core/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { tenantAgentSettingsKeys } from "#/entities/agent-settings/index.ts";
import { usageKeys } from "#/entities/usage/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { microUsdToMoney, moneyToMicroUsd } from "#/shared/lib/format/use-format-micro-usd.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldGroup, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { IntegerInput } from "#/shared/ui/molecules/IntegerInput/IntegerInput.tsx";
import { MoneyInput } from "#/shared/ui/molecules/MoneyInput/MoneyInput.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

export type UsageCapFormProps = {
  organizationId: string;
  /** The caps in force today (the plan or staff override, lowered by the organization's own cap if it set one). */
  caps: BudgetCaps;
  /** Offline: nothing can be saved. */
  disabled?: boolean | undefined;
};

/** The API answers 400 `VALIDATION_FAILED` with issue `ABOVE_PLAN` when the own cap exceeds the plan. */
const isAbovePlan = (error: unknown): boolean =>
  error instanceof ApiError && error.code === "VALIDATION_FAILED" && (error.details ?? []).some((detail) => detail.issue === "ABOVE_PLAN");

/**
 * The organization's own monthly cap (`PATCH /v1/agent-settings { budget }`,
 * core.agent-settings.update): it can only lower the cap of its plan, never raise it, and
 * removing it (`budget: null`) returns to the plan's caps. The budget guard enforces the result.
 * Removing lifts a cost guard for the whole organization, so it asks first.
 */
export function UsageCapForm({ organizationId, caps, disabled = false }: UsageCapFormProps) {
  const t = useTranslations("settings.usage.ownCap");
  const describe = useDescribeError();
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const [spend, setSpend] = useState<MoneyValue | null>(() => microUsdToMoney(caps.monthlyMicroUsd));
  const [tokens, setTokens] = useState<number | null>(caps.monthlyTokens);
  const [tokensInvalid, setTokensInvalid] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [problems, setProblems] = useState<{ spend?: true; tokens?: true }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "remove" | null>(null);

  /** Resolves `true` once saved; a failure is shown above the form. */
  const send = async (budget: BudgetCaps | null, kind: "save" | "remove"): Promise<boolean> => {
    setPending(kind);
    setFailure(null);
    try {
      await callEndpoint(updateAgentSettingsEndpoint, { query: { organizationId }, body: { budget } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenantAgentSettingsKeys.one(organizationId) }),
        queryClient.invalidateQueries({ queryKey: usageKeys.all(organizationId) }),
      ]);
      notify.success(t(kind === "save" ? "saved" : "removed"));
      return true;
    } catch (error: unknown) {
      const described = describe(error);
      setFailure(isAbovePlan(error) ? t("abovePlan") : described.requestId === undefined ? described.message : t("failureWithReference", { message: described.message, requestId: described.requestId }));
      return false;
    } finally {
      setPending(null);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (pending !== null) return;
    const found = { ...(spend === null ? { spend: true as const } : {}), ...(tokens === null || tokensInvalid ? { tokens: true as const } : {}) };
    setProblems(found);
    if (spend === null || tokens === null || found.tokens === true) return;
    void send({ monthlyMicroUsd: moneyToMicroUsd(spend), monthlyTokens: tokens }, "save");
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      {failure === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel>{t("spend")}</FieldLabel>
          <FieldControl>
            <MoneyInput value={spend} currency="USD" onValueChange={setSpend} disabled={disabled} className="sm:w-64" />
          </FieldControl>
          <FieldDescription>{t("spendHint")}</FieldDescription>
          <FieldError errors={[problems.spend === true ? t("problems.spend") : undefined]} />
        </Field>
        <Field>
          <FieldLabel>{t("tokens")}</FieldLabel>
          <FieldControl>
            <IntegerInput value={tokens} disabled={disabled} onValueChange={setTokens} onParseError={setTokensInvalid} className="sm:w-64" />
          </FieldControl>
          <FieldDescription>{t("tokensHint")}</FieldDescription>
          <FieldError errors={[problems.tokens === true ? t("problems.tokens") : undefined]} />
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={pending === "save"} disabled={disabled || pending === "remove"}>
          {t("save")}
        </Button>
        <Button type="button" variant="outline" pending={pending === "remove"} disabled={disabled || pending === "save"} onClick={() => setConfirmingRemove(true)}>
          {t("remove")}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmingRemove}
        onOpenChange={setConfirmingRemove}
        title={t("removeTitle")}
        description={t("removeDescription")}
        confirmLabel={t("removeConfirm")}
        destructive
        // Closes either way: a failure is shown above the form, not behind the modal.
        onConfirm={async () => {
          await send(null, "remove");
        }}
      />
    </form>
  );
}
