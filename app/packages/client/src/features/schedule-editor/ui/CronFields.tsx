"use client";

import { useTranslations } from "use-intl";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { CRON_PRESET_KINDS, type CronDraft, type CronPresetKind, cronOfDraft } from "../model/cron-presets.ts";

const WEEKDAYS = ["0", "1", "2", "3", "4", "5", "6"] as const;
const isKind = (value: string): value is CronPresetKind => (CRON_PRESET_KINDS as readonly string[]).includes(value);
const numberOf = (value: string): number => (value.trim() === "" ? Number.NaN : Number(value));

type Props = { draft: CronDraft; onChange: (draft: CronDraft) => void; invalid: boolean };

function PresetDetail({ draft, onChange }: Omit<Props, "invalid">) {
  const t = useTranslations("settings.workflows.editor");
  const timed =
    draft.kind === "daily" || draft.kind === "weekdays" || draft.kind === "weekly" || draft.kind === "monthly";
  return (
    <>
      {draft.kind === "hourly" ? (
        <Field>
          <FieldLabel>{t("minute")}</FieldLabel>
          <FieldControl>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              className="w-full sm:w-32"
              value={Number.isNaN(draft.minute) ? "" : draft.minute}
              onChange={(event) => onChange({ ...draft, minute: numberOf(event.target.value) })}
            />
          </FieldControl>
        </Field>
      ) : null}
      {draft.kind === "weekly" ? (
        <Field>
          <FieldLabel>{t("weekday")}</FieldLabel>
          <Select
            value={String(draft.weekday)}
            onValueChange={(value) => onChange({ ...draft, weekday: Number(value) })}
          >
            <FieldControl>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
            </FieldControl>
            <SelectContent>
              {WEEKDAYS.map((day) => (
                <SelectItem key={day} value={day}>
                  {t(`weekdays.${day}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {draft.kind === "monthly" ? (
        <Field>
          <FieldLabel>{t("monthDay")}</FieldLabel>
          <FieldControl>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={28}
              className="w-full sm:w-32"
              value={Number.isNaN(draft.monthDay) ? "" : draft.monthDay}
              onChange={(event) => onChange({ ...draft, monthDay: numberOf(event.target.value) })}
            />
          </FieldControl>
          <FieldDescription>{t("monthDayHint")}</FieldDescription>
        </Field>
      ) : null}
      {timed ? (
        <Field>
          <FieldLabel>{t("time")}</FieldLabel>
          <FieldControl>
            <Input
              type="time"
              className="w-full sm:w-40"
              value={draft.time}
              onChange={(event) => onChange({ ...draft, time: event.target.value })}
            />
          </FieldControl>
        </Field>
      ) : null}
      {draft.kind === "custom" ? (
        <Field>
          <FieldLabel>{t("custom")}</FieldLabel>
          <FieldControl>
            <Input
              className="font-mono"
              spellCheck={false}
              autoCapitalize="none"
              maxLength={120}
              value={draft.custom}
              onChange={(event) => onChange({ ...draft, custom: event.target.value })}
            />
          </FieldControl>
          <FieldDescription>{t("customHint")}</FieldDescription>
        </Field>
      ) : null}
    </>
  );
}

/**
 * The "how often" part of the schedule editor: a preset (hourly, daily, weekdays, weekly, monthly)
 * with its own inputs, or a hand-written 5-field cron. The resulting expression is always shown,
 * so a preset is never a black box.
 */
export function CronFields({ draft, onChange, invalid }: Props) {
  const t = useTranslations("settings.workflows.editor");
  const cron = cronOfDraft(draft);
  return (
    <>
      <Field invalid={invalid}>
        <FieldLabel>{t("frequency")}</FieldLabel>
        <Select value={draft.kind} onValueChange={(value) => isKind(value) && onChange({ ...draft, kind: value })}>
          <FieldControl>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
          </FieldControl>
          <SelectContent>
            {CRON_PRESET_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {t(`kinds.${kind}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {cron === null ? null : (
          <FieldDescription>
            <span className="font-mono">{t("cronPreview", { cron })}</span>
          </FieldDescription>
        )}
        <FieldError errors={[invalid ? t("errors.cron") : undefined]} />
      </Field>
      <PresetDetail draft={draft} onChange={onChange} />
    </>
  );
}
