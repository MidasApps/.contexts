"use client";

import type { AgentSettings } from "@core/contracts";
import { useTranslations } from "use-intl";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Switch } from "#/shared/ui/atoms/Switch/Switch.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { useSaveTenantAgentSettings } from "../model/use-save-tenant-agent-settings.ts";
import { SaveFailure } from "./SaveFailure.tsx";

export type AgentEnabledSwitchProps = {
  organizationId: string;
  agent: { readonly key: string; readonly name: string };
  settings: AgentSettings;
  /** The viewer holds `core.agent-settings.update`; otherwise only the state is shown. */
  canUpdate: boolean;
};

/**
 * Whether the supervisor may delegate to one agent in the organization: a switch for those who can
 * change it, the state in words for everyone else. The state comes from the settings, which the
 * switch updates optimistically.
 */
export function AgentEnabledSwitch({ organizationId, agent, settings, canUpdate }: AgentEnabledSwitchProps) {
  const t = useTranslations("settings.agents.catalog");
  const online = useOnlineStatus();
  const { save, saving, failure } = useSaveTenantAgentSettings(organizationId);
  const enabled = settings.enabledAgents.includes(agent.key);

  const toggle = (next: boolean): void => {
    const enabledAgents = next
      ? [...settings.enabledAgents, agent.key]
      : settings.enabledAgents.filter((key) => key !== agent.key);
    const done = next ? t("enabledToast", { agent: agent.name }) : t("disabledToast", { agent: agent.name });
    void save(settings, { patch: { enabledAgents }, next: { ...settings, enabledAgents }, done });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <span className="flex items-center gap-2">
        <StatusPill tone={enabled ? "emerald" : "neutral"}>{enabled ? t("enabled") : t("disabled")}</StatusPill>
        {canUpdate ? (
          <Switch
            checked={enabled}
            disabled={saving || !online}
            onCheckedChange={toggle}
            aria-label={t("enable", { agent: agent.name })}
          />
        ) : null}
      </span>
      <SaveFailure failure={failure} />
    </div>
  );
}
