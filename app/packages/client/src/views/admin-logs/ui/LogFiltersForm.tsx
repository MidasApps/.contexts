"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { LOG_LEVELS } from "#/entities/log-line/index.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";

const ANY = "any";

export type LogFilterValues = { level: string | undefined; q: string | undefined; traceId: string | undefined; requestId: string | undefined };

type TextKey = "q" | "traceId" | "requestId";
const TEXT_FIELDS: readonly { key: TextKey; maxLength: number; mono: boolean }[] = [
  { key: "q", maxLength: 200, mono: false },
  { key: "traceId", maxLength: 128, mono: true },
  { key: "requestId", maxLength: 128, mono: true },
];

/**
 * Filters of `/admin/logs`. The level applies at once; the text filters apply together on submit
 * (Enter or the button), so the URL does not change on every keystroke.
 */
export function LogFiltersForm({ values, onChange }: { values: LogFilterValues; onChange: (patch: Partial<LogFilterValues>) => void }) {
  const t = useTranslations("admin.logs.filters");
  const id = useId();
  const [draft, setDraft] = useState<Record<TextKey, string>>({ q: values.q ?? "", traceId: values.traceId ?? "", requestId: values.requestId ?? "" });
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    onChange({ q: draft.q.trim(), traceId: draft.traceId.trim(), requestId: draft.requestId.trim() });
  };
  return (
    <form role="search" aria-label={t("label")} onSubmit={submit} className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-level`}>{t("level")}</Label>
        <Select value={values.level ?? ANY} onValueChange={(value) => onChange({ level: value === ANY ? undefined : value })}>
          <SelectTrigger id={`${id}-level`} className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("anyLevel")}</SelectItem>
            {LOG_LEVELS.map((level) => (
              <SelectItem key={level} value={level}>
                {t(`levelOptions.${level}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {TEXT_FIELDS.map(({ key, maxLength, mono }) => (
        <div key={key} className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-${key}`}>{t(key)}</Label>
          <Input
            id={`${id}-${key}`}
            className={mono ? "w-full font-mono sm:w-64" : "w-full sm:w-56"}
            maxLength={maxLength}
            value={draft[key]}
            onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
          />
        </div>
      ))}
      <Button type="submit" variant="secondary">
        {t("apply")}
      </Button>
    </form>
  );
}
