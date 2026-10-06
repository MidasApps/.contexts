"use client";

import type { PickerProps } from "@core/contracts";
import { type FormEvent, useId, useState } from "react";
import { useTranslations } from "use-intl";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Checkbox } from "#/shared/ui/atoms/Checkbox/Checkbox.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { RadioGroup, RadioGroupItem } from "#/shared/ui/atoms/RadioGroup/RadioGroup.tsx";
import { useGenerativeUi } from "../../model/generative-ui-context.tsx";
import type { GenerativeComponentProps } from "../../model/ui-registry.ts";

/** The status line: green once sent, muted for "no longer active", hidden while it waits. */
const statusClass = (sent: boolean, note: string): string =>
  sent ? "text-body text-emerald-foreground" : note === "" ? "sr-only" : "text-body-sm text-muted-foreground";

type PickerChoicesProps = {
  props: PickerProps;
  baseId: string;
  shown: readonly string[];
  locked: boolean;
  onToggle: (value: string, on: boolean) => void;
  onPick: (value: string) => void;
};

/** The options: checkboxes for a multiple choice, a radio group otherwise. */
function PickerChoices({ props, baseId, shown, locked, onToggle, onPick }: PickerChoicesProps) {
  if (props.multiple)
    return props.options.map((option, index) => (
      <div key={option.value} className="flex items-center gap-2.5">
        <Checkbox
          id={`${baseId}-${index}`}
          checked={shown.includes(option.value)}
          onCheckedChange={(state) => onToggle(option.value, state === true)}
          disabled={locked}
        />
        <Label htmlFor={`${baseId}-${index}`}>{option.label}</Label>
      </div>
    ));
  return (
    <RadioGroup aria-labelledby={`${baseId}-legend`} value={shown[0] ?? ""} onValueChange={onPick} disabled={locked}>
      {props.options.map((option, index) => (
        <div key={option.value} className="flex items-center gap-2.5">
          <RadioGroupItem id={`${baseId}-${index}`} value={option.value} />
          <Label htmlFor={`${baseId}-${index}`}>{option.label}</Label>
        </div>
      ))}
    </RadioGroup>
  );
}

/**
 * `picker` (SP4 spec §5.2): a single (radio) or multiple (checkbox) choice the member answers
 * in the conversation. The group is a `fieldset` named by its legend; confirming with nothing
 * chosen says so next to the group instead of silently doing nothing. In the history it shows
 * the choice the next turn carried, or says it is no longer active when nobody answered it.
 */
export function PickerPart({
  props,
  toolCallId,
  toolName,
  interactive,
  stale,
  answer,
}: GenerativeComponentProps<PickerProps>) {
  const t = useTranslations("chat.ui.picker");
  const { submit } = useGenerativeUi();
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [missing, setMissing] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const baseId = useId();
  const errorId = `${baseId}-error`;
  const answered = answer?.kind === "picker" ? answer.values : undefined;
  const sent = submitted || answered !== undefined;
  const locked = sent || !interactive;
  const shown = submitted || answered === undefined ? chosen : answered;
  const note = sent ? t("submitted") : stale === true ? t("inactive") : "";

  const toggle = (value: string, on: boolean) => {
    setMissing(false);
    setChosen((current) =>
      on ? [...current.filter((item) => item !== value), value] : current.filter((item) => item !== value),
    );
  };

  const confirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || locked) return;
    if (chosen.length === 0) {
      setMissing(true);
      return;
    }
    const picked = props.options.filter((option) => chosen.includes(option.value));
    setPending(true);
    try {
      await submit(
        { kind: "picker", values: picked.map((option) => option.value), labels: picked.map((option) => option.label) },
        { toolCallId, toolName },
      );
      setSubmitted(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      data-slot="picker-part"
      noValidate
      onSubmit={(event) => void confirm(event)}
      className="flex flex-col gap-3 rounded-md border border-border bg-card p-4"
    >
      <fieldset disabled={locked} aria-describedby={missing ? errorId : undefined} className="flex flex-col gap-3">
        <legend id={`${baseId}-legend`} className="mb-3 text-sm font-semibold text-foreground">
          {props.multiple ? t("legendMultiple") : t("legend")}
        </legend>
        <PickerChoices
          props={props}
          baseId={baseId}
          shown={shown}
          locked={locked}
          onToggle={toggle}
          onPick={(value) => {
            setMissing(false);
            setChosen([value]);
          }}
        />
      </fieldset>
      <p id={errorId} role="alert" className={missing ? "text-body-sm text-destructive-text" : "sr-only"}>
        {missing ? t("required") : ""}
      </p>
      <p role="status" className={statusClass(sent, note)}>
        {note}
      </p>
      {locked ? null : (
        <div className="flex justify-end">
          <Button type="submit" size="sm" pending={pending}>
            {t("submit")}
          </Button>
        </div>
      )}
    </form>
  );
}
