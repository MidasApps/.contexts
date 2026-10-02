"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { useAgentCatalog } from "#/entities/agent-catalog/index.ts";
import { useCan } from "#/entities/permission/index.ts";
import { useAgentLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";

const ANY_STATUS = "any";
const ANY_AGENT = "any";
/** The supervisor answers every chat; it is not in the subagent catalog but has traces of its own. */
const SUPERVISOR = "assistant";

/** Agent keys are kebab-case (`GET /v1/traces` refuses anything else with 400). */
const AGENT_ID = /^[a-z][a-z0-9-]*$/u;

export type TraceFilterValues = { agentId: string | undefined; status: "ok" | "error" | undefined };

export type TraceFiltersProps = { organizationId: string; values: TraceFilterValues; onChange: (patch: Partial<TraceFilterValues>) => void };

const statusOf = (value: string): TraceFilterValues["status"] => (value === "ok" || value === "error" ? value : undefined);

/**
 * The agent as a list of names from the organization's catalog (`GET /v1/agents`), the supervisor
 * first. Only keys the trace filter accepts are offered (a custom agent's id is not one); a key
 * from elsewhere that is not in the catalog stays selectable under its label.
 */
type AgentOption = { readonly key: string; readonly name?: string | undefined };

function AgentSelect({ agents, value, onChange, pending }: { agents: readonly AgentOption[]; value: string | undefined; onChange: (agentId: string | undefined) => void; pending: boolean }) {
  const t = useTranslations("settings.traces.filters");
  const agentLabel = useAgentLabel();
  const id = useId();
  const options = value === undefined || agents.some((agent) => agent.key === value) ? agents : [...agents, { key: value }];
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{t("agent")}</Label>
      <Select value={value ?? ANY_AGENT} onValueChange={(next) => onChange(next === ANY_AGENT ? undefined : next)} disabled={pending}>
        <SelectTrigger id={id} className="w-full lg:w-56" aria-busy={pending || undefined}>
          <SelectValue placeholder={pending ? t("agentsLoading") : undefined} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_AGENT}>{t("anyAgent")}</SelectItem>
          {options.map((agent) => (
            <SelectItem key={agent.key} value={agent.key}>
              {agentLabel(agent.key, agent.name)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * The agent picker: names from the catalog when the viewer may read it (core.agent-settings.read);
 * without that permission, or when the catalog fails, the key is typed as before.
 */
const useAgentOptions = (organizationId: string): { status: "pending" | "ready" | "typed"; agents: AgentOption[] } => {
  const canRead = useCan("core.agent-settings.read", { organizationId });
  const catalog = useAgentCatalog(organizationId, { enabled: canRead });
  if (!canRead || catalog.isError) return { status: "typed", agents: [] };
  if (catalog.isPending) return { status: "pending", agents: [] };
  const listed = catalog.data.filter((entry) => AGENT_ID.test(entry.key) && entry.key !== SUPERVISOR).map(({ key, name }) => ({ key, name }));
  return { status: "ready", agents: [{ key: SUPERVISOR }, ...listed] };
};

/**
 * Filters the tenant trace list supports: status applies at once; the agent is picked by name, or
 * typed when the catalog is not readable (then it applies on submit, only as a valid agent key).
 */
export function TraceFilters({ organizationId, values, onChange }: TraceFiltersProps) {
  const t = useTranslations("settings.traces.filters");
  const agents = useAgentOptions(organizationId);
  if (agents.status !== "typed") {
    return (
      <div role="search" aria-label={t("label")} className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <StatusSelect value={values.status} onChange={(status) => onChange({ status })} />
        <AgentSelect agents={agents.agents} value={values.agentId} onChange={(agentId) => onChange({ agentId })} pending={agents.status === "pending"} />
      </div>
    );
  }
  return <TypedAgentFilters values={values} onChange={onChange} />;
}

function StatusSelect({ value, onChange }: { value: TraceFilterValues["status"]; onChange: (status: TraceFilterValues["status"]) => void }) {
  const t = useTranslations("settings.traces.filters");
  const statusText = useTranslations("common.traceViewer.status");
  const statusId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={statusId}>{t("status")}</Label>
      <Select value={value ?? ANY_STATUS} onValueChange={(next) => onChange(statusOf(next))}>
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
  );
}

/** Status and a typed agent key (no catalog): the key applies on submit, only in the kebab-case format. */
function TypedAgentFilters({ values, onChange }: Omit<TraceFiltersProps, "organizationId">) {
  const t = useTranslations("settings.traces.filters");
  const agentId = useId();
  const errorId = useId();
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
      <StatusSelect value={values.status} onChange={(status) => onChange({ status })} />
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
