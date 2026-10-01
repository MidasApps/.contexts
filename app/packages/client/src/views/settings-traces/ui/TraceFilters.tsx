"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";

const ANY_STATUS = "any";

/** Agent keys are kebab-case (`GET /v1/traces` refuses anything else with 400). */
const AGENT_ID = /^[a-z][a-z0-9-]*$/u;

export type TraceFilterValues = { agentId: string | undefined; status: "ok" | "error" | undefined };

export type TraceFiltersProps = { values: TraceFilterValues; onChange: (patch: Partial<TraceFilterValues>) => void };

const statusOf = (value: string): TraceFilterValues["status"] => (value === "ok" || value === "error" ? value : undefined);

/**
 * Filters the tenant trace list supports: status applies at once; the agent is typed, so it
 * applies on submit and only when it is a valid agent key (the error names the format).
 */
export function TraceFilters({ values, onChange }: TraceFiltersProps) {
  const t = useTranslations("settings.traces.filters");
  const statusText = useTranslations("common.traceViewer.status");
  const agentId = useId();
  const errorId = useId();
  const statusId = useId();
  const [draft, setDraft] = useState(values.agentId ?? "");
  const [invalid, setInvalid] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const agent = draft.trim();
    const valid = agent === "" || AGENT_ID.test(agent);
    setInvalid(!valid);
    if (valid) onChange({ agentId: agent === "" ? undefined : agent });
  };
  return (
    <form role="search" aria-label={t("label")} noValidate onSubmit={submit} className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={statusId}>{t("status")}</Label>
        <Select value={values.status ?? ANY_STATUS} onValueChange={(value) => onChange({ status: statusOf(value) })}>
          <SelectTrigger id={statusId} className="w-full lg:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_STATUS}>{t("anyStatus")}</SelectItem>
            <SelectItem value="ok">{statusText("ok")}</SelectItem>
            <SelectItem value="error">{statusText("error")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={agentId}>{t("agent")}</Label>
        <div className="flex gap-2">
          <Input
            id={agentId}
            className="lg:w-48"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("agentPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
          />
          <Button type="submit" variant="secondary">
            {t("apply")}
          </Button>
        </div>
        {invalid ? (
          <p id={errorId} role="alert" className="text-xs font-medium text-destructive-text">
            {t("agentInvalid")}
          </p>
        ) : null}
      </div>
    </form>
  );
}
