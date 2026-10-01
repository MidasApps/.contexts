"use client";

import { isSupportedLocale, SOURCE_LOCALE, utcToZonedWallTime, zonedWallTimeToUtc, type MoneyValue } from "@core/i18n";
import type { ReactElement, ReactNode } from "react";
import { Controller, useFormContext, type ControllerRenderProps, type FieldValues, type RefCallBack } from "react-hook-form";
import { useTimeZone, useTranslations } from "use-intl";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { Switch } from "#/shared/ui/atoms/Switch/Switch.tsx";
import { Textarea } from "#/shared/ui/atoms/Textarea/Textarea.tsx";
import { CurrencySelect } from "#/shared/ui/molecules/CurrencySelect/CurrencySelect.tsx";
import { Field, FieldContent, FieldControl, FieldDescription, FieldError, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { LocaleSelect } from "#/shared/ui/molecules/LocaleSelect/LocaleSelect.tsx";
import { MoneyInput } from "#/shared/ui/molecules/MoneyInput/MoneyInput.tsx";
import { TimeZoneSelect } from "#/shared/ui/molecules/TimeZoneSelect/TimeZoneSelect.tsx";
import type { FieldPlan } from "./field-plan.ts";

/** Money parse failures reported by the widget (the schema never sees unparseable text). */
export type MoneyParseReporter = (name: string, error: { code: string; currency: string } | null) => void;

export type SchemaFormFieldProps = {
  plan: FieldPlan;
  /** Currency for new money values (`AccessContext.regional.currency`). */
  defaultCurrency: string | undefined;
  onMoneyParse: MoneyParseReporter;
};

// RHF's ref travels apart from the other bound props (react-hooks/refs reads `field.*` as ref access).
type Bound = Omit<ControllerRenderProps<FieldValues, string>, "ref">;
type Bind = { field: Bound; controlRef: RefCallBack };

/** Props `FieldControl` injects (id for the label, description/error ids, invalid state). */
type ControlAria = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean };

const emptyToUndefined = (value: unknown): unknown => (value === "" ? undefined : value);
const toNumber = (value: unknown): unknown => (value === "" || value === undefined ? undefined : Number(value));

const useFieldText = (plan: FieldPlan) => {
  const t = useTranslations();
  const hintKey = `${plan.labelKey}Hint`;
  return { t, label: t(plan.labelKey), hint: t.has(hintKey) ? t(hintKey) : undefined };
};

/** Browser zone only without an intl time zone (decision 0013 §5). */
const useDisplayTimeZone = (): string => useTimeZone() ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

function RegisteredInput({ plan, aria }: { plan: FieldPlan; aria: ControlAria }) {
  const { register } = useFormContext();
  const { widget, name, required, integer } = plan;
  if (widget === "textarea") return <Textarea {...aria} required={required} {...register(name, { setValueAs: emptyToUndefined })} />;
  if (widget === "number") {
    return <Input {...aria} type="number" inputMode={integer ? "numeric" : "decimal"} step={integer ? 1 : "any"} required={required} {...register(name, { setValueAs: toNumber })} />;
  }
  return <Input {...aria} type={widget === "date" ? "date" : "text"} required={required} {...register(name, { setValueAs: emptyToUndefined })} />;
}

function DateTimeInput({ field, controlRef, required, aria }: Bind & { required: boolean; aria: ControlAria }) {
  const timeZone = useDisplayTimeZone();
  const value = typeof field.value === "string" && field.value !== "" ? utcToZonedWallTime(field.value, timeZone) : "";
  return (
    <Input
      {...aria}
      ref={controlRef}
      type="datetime-local"
      name={field.name}
      required={required}
      value={value}
      onBlur={field.onBlur}
      onChange={(event) => field.onChange(event.target.value === "" ? undefined : zonedWallTimeToUtc(event.target.value, timeZone))}
    />
  );
}

function EnumSelect({ field, controlRef, plan, aria }: Bind & { plan: FieldPlan; aria: ControlAria }) {
  const t = useTranslations();
  return (
    <Select value={typeof field.value === "string" ? field.value : ""} onValueChange={field.onChange} required={plan.required} name={field.name}>
      <SelectTrigger {...aria} ref={controlRef} onBlur={field.onBlur} className="w-full">
        <SelectValue placeholder={t("common.form.selectPlaceholder")} />
      </SelectTrigger>
      <SelectContent>
        {plan.options.map((option) => (
          <SelectItem key={option} value={option}>
            {t(`${plan.labelKey}Options.${option}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MoneyWidget({ field, controlRef, plan, aria, defaultCurrency, onMoneyParse }: Bind & { plan: FieldPlan; aria: ControlAria } & Omit<SchemaFormFieldProps, "plan">) {
  const value = (field.value as MoneyValue | undefined) ?? null;
  const currency = value?.currency ?? defaultCurrency;
  // A money field without a currency is a caller bug: SchemaForm needs `defaultCurrency`.
  if (currency === undefined) throw new RangeError(`SchemaForm: money field "${plan.name}" needs defaultCurrency`);
  return (
    <MoneyInput
      {...aria}
      ref={controlRef}
      name={field.name}
      required={plan.required}
      value={value}
      currency={currency}
      onBlur={field.onBlur}
      onValueChange={(next) => field.onChange(next ?? undefined)}
      onParseError={(code) => onMoneyParse(plan.name, code === null ? null : { code, currency })}
    />
  );
}

/** The control for one plan, bound to the form (register for native inputs, Controller else). */
function ControlFor({ plan, defaultCurrency, onMoneyParse, ...aria }: SchemaFormFieldProps & ControlAria): ReactElement {
  const { control } = useFormContext();
  if (plan.widget === "text" || plan.widget === "textarea" || plan.widget === "number" || plan.widget === "date") {
    return <RegisteredInput plan={plan} aria={aria} />;
  }
  const render = ({ field: { ref: controlRef, ...field } }: { field: ControllerRenderProps<FieldValues, string> }): ReactElement => {
    if (plan.widget === "datetime") return <DateTimeInput field={field} controlRef={controlRef} required={plan.required} aria={aria} />;
    if (plan.widget === "select") return <EnumSelect field={field} controlRef={controlRef} plan={plan} aria={aria} />;
    if (plan.widget === "money") return <MoneyWidget field={field} controlRef={controlRef} plan={plan} aria={aria} defaultCurrency={defaultCurrency} onMoneyParse={onMoneyParse} />;
    if (plan.widget === "switch") return <Switch {...aria} ref={controlRef} name={field.name} checked={field.value === true} onCheckedChange={field.onChange} onBlur={field.onBlur} />;
    if (plan.widget === "locale") {
      const value = typeof field.value === "string" && isSupportedLocale(field.value) ? field.value : SOURCE_LOCALE;
      return <LocaleSelect {...aria} ref={controlRef} className="w-full" value={value} onValueChange={field.onChange} onBlur={field.onBlur} />;
    }
    const Picker = plan.widget === "timeZone" ? TimeZoneSelect : CurrencySelect;
    return <Picker {...aria} ref={controlRef} className="w-full" value={field.value as string | undefined} onValueChange={field.onChange} onBlur={field.onBlur} />;
  };
  return <Controller name={plan.name} control={control} render={render} />;
}

function RequiredMark({ required, text }: { required: boolean; text: string }): ReactNode {
  return required ? (
    <>
      {" "}
      <span className="font-normal text-muted-foreground">({text})</span>
    </>
  ) : null;
}

/**
 * One contract field: label (with a textual "required" mark), optional hint `<labelKey>Hint`
 * before the control (rules/accessibility.md "Formulários"), the widget and its error, all wired
 * by `Field`. Switches use the horizontal row layout.
 */
export function SchemaFormField(props: SchemaFormFieldProps) {
  const { plan } = props;
  const { t, label, hint } = useFieldText(plan);
  const timeZone = useDisplayTimeZone();
  const { formState } = useFormContext();
  const message = formState.errors[plan.name]?.message;
  const error = typeof message === "string" ? message : undefined;
  const zoneHint = plan.widget === "datetime" ? t("common.form.timeZoneHint", { timeZone }) : undefined;
  const description = [hint, zoneHint].filter(Boolean).join(" ");
  const labelNode = (
    <FieldLabel>
      {label}
      <RequiredMark required={plan.required} text={t("common.form.required")} />
    </FieldLabel>
  );
  const describe = description === "" ? null : <FieldDescription>{description}</FieldDescription>;
  const control = (
    <FieldControl>
      <ControlFor {...props} />
    </FieldControl>
  );
  if (plan.widget === "switch") {
    return (
      <Field orientation="horizontal" invalid={error !== undefined} data-field={plan.name}>
        <FieldContent>
          {labelNode}
          {describe}
          <FieldError errors={[error]} />
        </FieldContent>
        {control}
      </Field>
    );
  }
  return (
    <Field invalid={error !== undefined} data-field={plan.name}>
      {labelNode}
      {describe}
      {control}
      <FieldError errors={[error]} />
    </Field>
  );
}
