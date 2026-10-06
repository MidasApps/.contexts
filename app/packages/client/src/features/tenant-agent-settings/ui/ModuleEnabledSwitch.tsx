"use client";

import type { AgentSettings } from "@core/contracts";
import { useTranslations } from "use-intl";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Switch } from "#/shared/ui/atoms/Switch/Switch.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { useSaveTenantAgentSettings } from "../model/use-save-tenant-agent-settings.ts";
import { SaveFailure } from "./SaveFailure.tsx";

export type ModuleEnabledSwitchProps = {
  organizationId: string;
  module: { readonly id: string; readonly label: string };
  settings: AgentSettings;
  /** The viewer holds `core.agent-settings.update`; otherwise only the state is shown. */
  canUpdate: boolean;
};

/**
 * Whether an installed module's commands, skills and agents reach the organization (decision 0064):
 * the module id in `enabledAgents`, the same list the agent switches change. Turning it off removes
 * only the module id; an enabled agent of the module keeps the module on, and the hint says so.
 */
export function ModuleEnabledSwitch({ organizationId, module, settings, canUpdate }: ModuleEnabledSwitchProps) {
  const t = useTranslations("settings.agents.modules");
  const online = useOnlineStatus();
  const { save, saving, failure } = useSaveTenantAgentSettings(organizationId);
  const enabled = settings.enabledAgents.includes(module.id);
  const viaAgents = !enabled && settings.enabledAgents.some((key) => key.startsWith(`${module.id}-`));

  const toggle = (next: boolean): void => {
    const enabledAgents = next
      ? [...settings.enabledAgents, module.id]
      : settings.enabledAgents.filter((key) => key !== module.id);
    const done = next ? t("enabledToast", { module: module.label }) : t("disabledToast", { module: module.label });
    void save(settings, { patch: { enabledAgents }, next: { ...settings, enabledAgents }, done });
  };

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <span className="flex items-center gap-2">
        <StatusPill tone={enabled ? "emerald" : "neutral"}>{enabled ? t("enabled") : t("disabled")}</StatusPill>
        {canUpdate ? (
          <Switch
            checked={enabled}
            disabled={saving || !online}
            onCheckedChange={toggle}
            aria-label={t("enable", { module: module.label })}
          />
        ) : null}
      </span>
      {viaAgents ? <p className="text-xs text-muted-foreground">{t("viaAgents")}</p> : null}
      <SaveFailure failure={failure} />
    </div>
  );
}
