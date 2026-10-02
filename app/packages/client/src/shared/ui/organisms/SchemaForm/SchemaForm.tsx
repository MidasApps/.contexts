"use client";

import type { ContractDefinition } from "@core/contracts";
import { currencyMinorDigits } from "@core/i18n";
import { useEffect, useMemo, useRef, useState, type ComponentProps, type FormEvent } from "react";
import { FormProvider, useForm, type FieldErrors, type FieldValues, type UseFormReturn } from "react-hook-form";
import { useLocale, useTranslations } from "use-intl";
import type { z } from "zod";
import { cn } from "#/shared/lib/cn.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { FieldGroup, FieldLegend, FieldSet } from "#/shared/ui/molecules/Field/Field.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { formatMoneyInputText } from "#/shared/ui/molecules/MoneyInput/money-input-text.ts";
import { createContractResolver } from "./contract-resolver.ts";
import { planSchemaForm, type FieldSection, type FormPlan } from "./field-plan.ts";
import { describeServerIssue, describeZodIssue, type MessageDescriptor } from "./issue-messages.ts";
import { SchemaFormStatus, type SubmitStatus } from "./SchemaFormStatus.tsx";
import { mapServerErrors, toSchemaFormFailure, type SchemaFormFailure, type SchemaFormResult } from "./server-errors.ts";
import { SchemaFormField, type MoneyParseReporter } from "./widgets.tsx";

export type SchemaFormProps<Schema extends z.ZodType> = Omit<ComponentProps<"form">, "onSubmit" | "children" | "noValidate"> & {
  /** Object contract (`defineContract`); its field meta drives the form (SP2 spec §3.1). */
  contract: ContractDefinition<Schema>;
  /** Initial values; fields not rendered (hidden, no permission) are submitted as given here. */
  defaultValues?: Partial<z.input<Schema>> | undefined;
  /** Receives the parsed contract output; resolve `{ ok: false, error }` for API failures. */
  onSubmit: (values: z.output<Schema>) => Promise<SchemaFormResult>;
  /** Permission check for `ui.visibleWith`; without it those fields stay hidden. */
  can?: ((permission: string) => boolean) | undefined;
  /** i18n key of the submit button (default `common.actions.save`). */
  submitLabelKey?: string | undefined;
  /** i18n key of the success message (default `common.states.saved`). */
  successMessageKey?: string | undefined;
  /** Currency for new money values (`AccessContext.regional.currency`). */
  defaultCurrency?: string | undefined;
  /** Values still loading: shows a skeleton instead of the form. */
  loading?: boolean | undefined;
  /** Called when the values start or stop differing from the defaults (a dialog guards dismissal with it). */
  onDirtyChange?: ((dirty: boolean) => void) | undefined;
};

const denyAll = (): boolean => false;

const useTranslate = () => {
  const t = useTranslations();
  return (message: MessageDescriptor): string => t(message.key, message.values);
};

/** Money parse errors live outside RHF so the resolver can re-add them on every validation. */
const useMoneyParseErrors = () => {
  const t = useTranslations("common.money");
  const locale = useLocale();
  const errors = useRef(new Map<string, string>());
  const report: MoneyParseReporter = (name, error) => {
    if (error === null) errors.current.delete(name);
    else if (error.code === "TOO_MANY_FRACTION_DIGITS") errors.current.set(name, t("tooManyDigits", { digits: currencyMinorDigits(error.currency) }));
    else errors.current.set(name, t("invalid", { example: formatMoneyInputText({ amountMinor: 123456, currency: error.currency }, locale) }));
  };
  return { report, read: () => errors.current };
};

const withSwitchDefaults = (plan: FormPlan, values: Record<string, unknown>): Record<string, unknown> => {
  const switches = plan.sections.flatMap((section) => section.fields).filter((field) => field.widget === "switch");
  return { ...values, ...Object.fromEntries(switches.map((field) => [field.name, values[field.name] ?? false])) };
};

const renderedNames = (plan: FormPlan): Set<string> =>
  new Set(plan.sections.flatMap((section) => section.fields.map((field) => field.name)));

/** Applies an API failure: field errors (focusing the first) and/or the form-level alert. */
const applyFailure = (form: UseFormReturn, failure: SchemaFormFailure, rendered: ReadonlySet<string>, translate: (m: MessageDescriptor) => string): SubmitStatus => {
  const mapped = mapServerErrors(failure, rendered);
  mapped.fieldIssues.forEach(({ name, issue }, index) =>
    form.setError(name, { type: "server", message: translate(describeServerIssue(issue)) }, { shouldFocus: index === 0 }),
  );
  if (!mapped.showFormError) return { kind: "idle" };
  return { kind: "failed", failure, focus: mapped.fieldIssues.length === 0 };
};

/** Client errors on fields the user cannot see or fix here get the form-level alert. */
const invalidStatus = (errors: FieldErrors, rendered: ReadonlySet<string>): SubmitStatus => {
  const hiddenOnly = Object.keys(errors).filter((name) => !rendered.has(name));
  if (hiddenOnly.length === 0) return { kind: "idle" };
  return { kind: "unavailable", focus: hiddenOnly.length === Object.keys(errors).length };
};

function Sections({ sections, defaultCurrency, onMoneyParse }: { sections: readonly FieldSection[]; defaultCurrency: string | undefined; onMoneyParse: MoneyParseReporter }) {
  const t = useTranslations();
  return sections.map((section, index) => {
    const fields = section.fields.map((plan) => (
      <SchemaFormField key={plan.name} plan={plan} defaultCurrency={defaultCurrency} onMoneyParse={onMoneyParse} />
    ));
    if (section.group === undefined) return <FieldGroup key={`section-${String(index)}`}>{fields}</FieldGroup>;
    return (
      <FieldSet key={`section-${String(index)}`}>
        <FieldLegend>{t(section.group)}</FieldLegend>
        <FieldGroup>{fields}</FieldGroup>
      </FieldSet>
    );
  });
}

/**
 * Form rendered from a contract (SP2 spec §3.1; SP4's `renderForm` tool): field meta picks the
 * widget, label, order, fieldset and visibility; validation runs the contract schema with
 * translated messages; server `VALIDATION_FAILED` details map back to fields. States: loading
 * skeleton, submitting (button busy, no double submit), success status, error alert with the
 * request reference. The first invalid field (or the alert) receives focus after a failed submit.
 */
export function SchemaForm<Schema extends z.ZodType>({
  contract,
  defaultValues,
  onSubmit,
  can = denyAll,
  submitLabelKey = "common.actions.save",
  successMessageKey = "common.states.saved",
  defaultCurrency,
  loading = false,
  onDirtyChange,
  className,
  ...formProps
}: SchemaFormProps<Schema>) {
  const t = useTranslations();
  const translate = useTranslate();
  const plan = useMemo(() => planSchemaForm(contract, { can }), [contract, can]);
  const rendered = useMemo(() => renderedNames(plan), [plan]);
  const money = useMoneyParseErrors();
  const [status, setStatus] = useState<SubmitStatus>({ kind: "idle" });
  const submitting = useRef(false);
  const form = useForm<FieldValues>({
    defaultValues: withSwitchDefaults(plan, defaultValues ?? {}),
    resolver: createContractResolver(contract.schema, (issue, value) => translate(describeZodIssue(issue, value)), money.read),
  });

  // Read during render so react-hook-form subscribes to it.
  const dirty = form.formState.isDirty;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const submit = form.handleSubmit(
    async (values) => {
      setStatus({ kind: "idle" });
      const result = await onSubmit(values as z.output<Schema>).catch((thrown: unknown): SchemaFormResult => ({ ok: false, error: toSchemaFormFailure(thrown) }));
      if (result.ok) {
        form.reset(form.getValues());
        setStatus({ kind: "saved" });
        return;
      }
      setStatus(applyFailure(form, result.error, rendered, translate));
    },
    (errors) => setStatus(invalidStatus(errors, rendered)),
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    // Enter in a field while a submit is pending must not send the form twice.
    if (submitting.current) return;
    submitting.current = true;
    try {
      await submit(event);
    } finally {
      submitting.current = false;
    }
  };

  if (loading) return <LoadingState rows={4} />;
  return (
    <FormProvider {...form}>
      <form noValidate className={cn("flex flex-col gap-6", className)} onSubmit={(event) => void handleSubmit(event)} {...formProps}>
        <SchemaFormStatus status={status} successMessage={t(successMessageKey)} />
        <Sections sections={plan.sections} defaultCurrency={defaultCurrency} onMoneyParse={money.report} />
        <div className="flex justify-end">
          <Button type="submit" pending={form.formState.isSubmitting}>
            {t(submitLabelKey)}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

