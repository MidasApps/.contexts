"use client";

import type { AgentSettings } from "@core/contracts";
import { useId } from "react";
import { useTranslations } from "use-intl";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { RadioGroup, RadioGroupItem } from "#/shared/ui/atoms/RadioGroup/RadioGroup.tsx";
import { Switch } from "#/shared/ui/atoms/Switch/Switch.tsx";
import { useSaveTenantAgentSettings } from "../model/use-save-tenant-agent-settings.ts";
import { SaveFailure } from "./SaveFailure.tsx";

type PiiMode = AgentSettings["guardrails"]["pii"];
type WebTool = keyof AgentSettings["webTools"];

export type OrganizationAgentRulesProps = { organizationId: string; settings: AgentSettings; canUpdate: boolean };

function WebToolRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <li className="flex items-start justify-between gap-4 py-2.5">
      <span className="flex min-w-0 flex-col gap-0.5">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        <span id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </span>
      </span>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-describedby={`${id}-hint`}
      />
    </li>
  );
}

function PiiModeGroup({
  value,
  disabled,
  onChange,
}: {
  value: PiiMode;
  disabled: boolean;
  onChange: (mode: PiiMode) => void;
}) {
  const t = useTranslations("settings.agents.organization.pii");
  const id = useId();
  return (
    <section className="flex flex-col gap-2">
      <h3 id={id} className="text-sm font-medium">
        {t("title")}
      </h3>
      <RadioGroup
        aria-labelledby={id}
        value={value}
        disabled={disabled}
        onValueChange={(next) => (next === "warn" || next === "redact") && next !== value && onChange(next)}
      >
        {(["warn", "redact"] as const).map((mode) => (
          <div key={mode} className="flex items-start gap-2.5">
            <RadioGroupItem
              id={`${id}-${mode}`}
              value={mode}
              className="mt-0.5"
              aria-describedby={`${id}-${mode}-hint`}
            />
            <span className="flex flex-col gap-0.5">
              <Label htmlFor={`${id}-${mode}`} className="text-sm">
                {t(mode)}
              </Label>
              <span id={`${id}-${mode}-hint`} className="text-xs text-muted-foreground">
                {t(`${mode}Hint`)}
              </span>
            </span>
          </div>
        ))}
      </RadioGroup>
    </section>
  );
}

/**
 * Rules that apply to every agent of the organization: the web tool opt-ins and what the PII
 * detector does with personal data in user messages. Each control saves on change; a viewer
 * without `core.agent-settings.update` sees them disabled.
 */
export function OrganizationAgentRules({ organizationId, settings, canUpdate }: OrganizationAgentRulesProps) {
  const t = useTranslations("settings.agents.organization");
  const online = useOnlineStatus();
  const headingId = useId();
  const { save, saving, failure } = useSaveTenantAgentSettings(organizationId);
  const disabled = !canUpdate || saving || !online;

  const setWebTool = (tool: WebTool, enabled: boolean): void => {
    const webTools = { ...settings.webTools, [tool]: enabled };
    void save(settings, { patch: { webTools }, next: { ...settings, webTools }, done: t("saved") });
  };
  const setPii = (pii: PiiMode): void => {
    const guardrails = { pii };
    void save(settings, { patch: { guardrails }, next: { ...settings, guardrails }, done: t("saved") });
  };

  return (
    <div data-slot="organization-agent-rules" aria-busy={saving || undefined} className="flex flex-col gap-5">
      <SaveFailure failure={failure} />
      <section aria-labelledby={headingId} className="flex flex-col gap-1">
        <h3 id={headingId} className="text-sm font-medium">
          {t("webTools.title")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("webTools.description")}</p>
        <ul className="divide-y divide-border">
          <WebToolRow
            label={t("webTools.firecrawl")}
            hint={t("webTools.firecrawlHint")}
            checked={settings.webTools.firecrawl}
            disabled={disabled}
            onChange={(enabled) => setWebTool("firecrawl", enabled)}
          />
          <WebToolRow
            label={t("webTools.browser")}
            hint={t("webTools.browserHint")}
            checked={settings.webTools.browser}
            disabled={disabled}
            onChange={(enabled) => setWebTool("browser", enabled)}
          />
        </ul>
      </section>
      <PiiModeGroup value={settings.guardrails.pii} disabled={disabled} onChange={setPii} />
    </div>
  );
}
