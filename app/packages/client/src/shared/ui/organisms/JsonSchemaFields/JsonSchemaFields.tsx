"use client";

import { useState } from "react";
import { useTranslations } from "use-intl";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { Switch } from "#/shared/ui/atoms/Switch/Switch.tsx";
import { Textarea } from "#/shared/ui/atoms/Textarea/Textarea.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "#/shared/ui/molecules/Field/Field.tsx";
import { switchJsonInputMode, type JsonInputDraft, type JsonInputProblems } from "./json-input-draft.ts";
import type { JsonFieldPlan, JsonSchemaPlan } from "./json-schema-plan.ts";

export type JsonSchemaFieldsProps = {
  plan: JsonSchemaPlan;
  draft: JsonInputDraft;
  onDraftChange: (draft: JsonInputDraft) => void;
  /** Client checks and the server's `VALIDATION_FAILED` details mapped to fields. */
  problems: JsonInputProblems;
  /** The human label of a field (catalog key, contract `ui.labelKey`, schema title). */
  labelOf: (field: JsonFieldPlan) => string;
  /** Hint under the JSON text (what the input is used for). */
  jsonHint: string;
};

type ControlProps = { field: JsonFieldPlan; value: string | boolean | undefined; onChange: (value: string | boolean) => void };

function OptionSelect({ field, value, onChange }: ControlProps) {
  const t = useTranslations();
  const optionLabel = (option: string): string => {
    const key = field.labelKey === undefined ? undefined : `${field.labelKey}Options.${option}`;
    return key !== undefined && t.has(key) ? t(key) : option;
  };
  return (
    <Select value={typeof value === "string" ? value : ""} onValueChange={onChange} required={field.required}>
      <FieldControl>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t("common.form.selectPlaceholder")} />
        </SelectTrigger>
      </FieldControl>
      <SelectContent>
        {field.options.map((option) => (
          <SelectItem key={option} value={option}>
            {optionLabel(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FieldInput({ field, value, onChange }: ControlProps) {
  const text = typeof value === "string" ? value : "";
  if (field.kind === "switch") {
    return (
      <FieldControl>
        <Switch checked={value === true} onCheckedChange={onChange} />
      </FieldControl>
    );
  }
  if (field.kind === "select") return <OptionSelect field={field} value={value} onChange={onChange} />;
  if (field.kind === "textarea") {
    return (
      <FieldControl>
        <Textarea rows={4} required={field.required} maxLength={field.maxLength} value={text} onChange={(event) => onChange(event.target.value)} />
      </FieldControl>
    );
  }
  const numeric = field.kind === "number" || field.kind === "integer";
  return (
    <FieldControl>
      <Input
        // Text, not type="number": decimal commas (pt-BR, es-419) must type as they read.
        type="text"
        inputMode={numeric ? (field.kind === "integer" ? "numeric" : "decimal") : undefined}
        required={field.required}
        maxLength={numeric ? undefined : field.maxLength}
        value={text}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldControl>
  );
}

function FormFields({ fields, draft, onDraftChange, problems, labelOf }: Omit<JsonSchemaFieldsProps, "plan" | "jsonHint"> & { fields: readonly JsonFieldPlan[] }) {
  const t = useTranslations();
  return (
    <FieldGroup>
      {fields.map((field) => {
        const problem = problems.fields[field.name];
        return (
          <Field key={field.name} orientation={field.kind === "switch" ? "horizontal" : "vertical"}>
            <FieldLabel>
              {labelOf(field)}
              {field.required ? <span className="font-normal text-muted-foreground"> ({t("common.form.required")})</span> : null}
            </FieldLabel>
            <FieldInput field={field} value={draft.fields[field.name]} onChange={(value) => onDraftChange({ ...draft, fields: { ...draft.fields, [field.name]: value } })} />
            <FieldError errors={[problem === undefined ? undefined : t(problem.key, problem.values)]} />
          </Field>
        );
      })}
    </FieldGroup>
  );
}

/**
 * Workflow input from its JSON Schema (UX review U-18): a flat object becomes labelled fields,
 * with "edit as JSON" as the advanced way out; any other shape is edited as JSON text; no schema
 * (or no properties) renders nothing. The schema itself is never shown. Pair with
 * `planJsonSchemaFields`, `draftOfValue`, `readJsonInput` and `serverProblemsOf`.
 */
export function JsonSchemaFields({ plan, draft, onDraftChange, problems, labelOf, jsonHint }: JsonSchemaFieldsProps) {
  const t = useTranslations("common.jsonInput");
  const [switchBlocked, setSwitchBlocked] = useState(false);
  if (plan.kind === "none") return null;
  const toggle = (): void => {
    const switched = switchJsonInputMode(plan, draft, draft.mode === "json" ? "fields" : "json");
    setSwitchBlocked(!switched.ok);
    if (switched.ok) onDraftChange(switched.draft);
  };
  const jsonError = problems.json || switchBlocked ? t(switchBlocked ? "switchBlocked" : "invalid") : undefined;
  return (
    <FieldSet>
      {/* The legend stays the fieldset's first child: that is what names the group. */}
      <FieldLegend>{t("legend")}</FieldLegend>
      {plan.kind === "fields" ? (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={toggle}>
            {draft.mode === "json" ? t("editAsForm") : t("editAsJson")}
          </Button>
        </div>
      ) : null}
      {plan.kind === "fields" && draft.mode === "fields" ? (
        <FormFields fields={plan.fields} draft={draft} onDraftChange={onDraftChange} problems={problems} labelOf={labelOf} />
      ) : (
        <Field>
          <FieldLabel>{t("label")}</FieldLabel>
          <FieldControl>
            <Textarea
              className="font-mono text-[13px]"
              rows={5}
              spellCheck={false}
              value={draft.json}
              onChange={(event) => {
                setSwitchBlocked(false);
                onDraftChange({ ...draft, json: event.target.value });
              }}
            />
          </FieldControl>
          <FieldDescription>{jsonHint}</FieldDescription>
          <FieldError errors={[jsonError]} />
        </Field>
      )}
    </FieldSet>
  );
}
