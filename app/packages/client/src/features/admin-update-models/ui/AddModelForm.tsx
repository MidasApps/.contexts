"use client";

import { type FormEvent, useState } from "react";
import { useTranslations } from "use-intl";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import {
  type AddedModel,
  type AddModelRefusal,
  addModelRefusal,
  type ModelSettingsFormState,
} from "../model/model-settings-form.ts";
import { PriceInput } from "./PriceInput.tsx";

type Draft = { modelId: string; input: number | null; output: number | null };
const EMPTY: Draft = { modelId: "", input: null, output: null };

export type AddModelFormProps = {
  form: ModelSettingsFormState;
  disabled: boolean;
  onAdd: (added: AddedModel) => void;
};

/** Adds a model with its price to the table (saved with the page), so a role can be pointed at it. */
export function AddModelForm({ form, disabled, onAdd }: AddModelFormProps) {
  const t = useTranslations("admin.models.add");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [refusal, setRefusal] = useState<AddModelRefusal | null>(null);
  // Remounts the price fields empty after an add.
  const [round, setRound] = useState(0);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const modelId = draft.modelId.trim();
    const refused = addModelRefusal(form, modelId);
    setRefusal(refused);
    if (refused !== null || draft.input === null || draft.output === null) return;
    onAdd({ modelId, inputMicroUsdPerMTok: draft.input, outputMicroUsdPerMTok: draft.output });
    setDraft(EMPTY);
    setRound((count) => count + 1);
  };

  return (
    <form
      aria-label={t("title")}
      className="flex flex-col gap-3 border-t border-border pt-4"
      onSubmit={submit}
      noValidate
    >
      <h3 className="text-sm font-medium">{t("title")}</h3>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
        <Field className="gap-1" invalid={refusal !== null}>
          <FieldLabel>{t("modelId")}</FieldLabel>
          <FieldControl>
            <Input
              value={draft.modelId}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              disabled={disabled}
              onChange={(event) => {
                setDraft((current) => ({ ...current, modelId: event.target.value }));
                setRefusal(null);
              }}
            />
          </FieldControl>
          <FieldDescription>{t("modelIdHint")}</FieldDescription>
          <FieldError>{refusal === null ? undefined : t(`refusals.${refusal}`)}</FieldError>
        </Field>
        <PriceInput
          key={`input-${String(round)}`}
          label={t("input")}
          value={null}
          disabled={disabled}
          onValueChange={(input) => setDraft((current) => ({ ...current, input }))}
        />
        <PriceInput
          key={`output-${String(round)}`}
          label={t("output")}
          value={null}
          disabled={disabled}
          onValueChange={(output) => setDraft((current) => ({ ...current, output }))}
        />
        <Button
          type="submit"
          variant="outline"
          className="sm:mt-7"
          disabled={disabled || draft.modelId.trim() === "" || draft.input === null || draft.output === null}
        >
          <Icon name="plus" />
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
