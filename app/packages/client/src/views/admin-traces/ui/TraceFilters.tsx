"use client";

import { type FormEvent, useId, useState } from "react";
import { useTranslations } from "use-intl";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { AdminOrganizationFilter } from "#/widgets/admin-nav/index.ts";

const ANY_STATUS = "any";

/** Agent keys are kebab-case (`adminListTracesEndpoint` refuses anything else with 400). */
export const AGENT_ID = /^[a-z][a-z0-9-]*$/u;

export type TraceFilterValues = {
  organizationId: string | undefined;
  agentId: string | undefined;
  status: "ok" | "error" | undefined;
  /** Calendar days (`2026-09-30`) in the browser's time zone; both ends are included. */
  from: string | undefined;
  to: string | undefined;
};

export type TraceFiltersProps = {
  values: TraceFilterValues;
  onChange: (patch: Partial<Record<keyof TraceFilterValues, string | undefined>>) => void;
};

/** Any status, or only the traces that ended ok or in an error. */
function StatusFilter({
  value,
  onChange,
}: {
  value: TraceFilterValues["status"];
  onChange: (status: string | undefined) => void;
}) {
  const t = useTranslations("admin.traces.filters");
  const statusText = useTranslations("common.traceViewer.status");
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{t("status")}</Label>
      <Select value={value ?? ANY_STATUS} onValueChange={(next) => onChange(next === ANY_STATUS ? undefined : next)}>
        <SelectTrigger id={id} className="w-full lg:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_STATUS}>{t("anyStatus")}</SelectItem>
          <SelectItem value="ok">{statusText("ok")}</SelectItem>
          <SelectItem value="error">{statusText("error")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Filters of the trace list: organization, status and the days apply at once; the agent is typed,
 * so it applies on submit and only when it is a valid agent key (the error names the format).
 */
export function TraceFilters({ values, onChange }: TraceFiltersProps) {
  const t = useTranslations("admin.traces.filters");
  const agentId = useId();
  const errorId = useId();
  const fromId = useId();
  const toId = useId();
  const dateHintId = useId();
  // Decision 0042: every date of `/admin` is in the browser's zone; the rule is said next to the days.
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [draft, setDraft] = useState(values.agentId ?? "");
  const [invalid, setInvalid] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const agent = draft.trim();
    const valid = agent === "" || AGENT_ID.test(agent);
    setInvalid(!valid);
    if (valid) onChange({ agentId: agent });
  };
  return (
    <form
      role="search"
      aria-label={t("label")}
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end"
    >
      <AdminOrganizationFilter
        value={values.organizationId}
        onValueChange={(organizationId) => onChange({ organizationId })}
      />
      <StatusFilter value={values.status} onChange={(status) => onChange({ status })} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fromId}>{t("from")}</Label>
        <Input
          id={fromId}
          type="date"
          className="lg:w-40"
          value={values.from ?? ""}
          max={values.to}
          aria-describedby={dateHintId}
          onChange={(event) => onChange({ from: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={toId}>{t("to")}</Label>
        <Input
          id={toId}
          type="date"
          className="lg:w-40"
          value={values.to ?? ""}
          min={values.from}
          aria-describedby={dateHintId}
          onChange={(event) => onChange({ to: event.target.value })}
        />
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
      <p id={dateHintId} className="text-xs text-muted-foreground lg:basis-full">
        {t("dateHint", { zone })}
      </p>
    </form>
  );
}
