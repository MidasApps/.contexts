"use client";

import {
  type AgentSettings,
  type UpdateAgentSettingsInput,
  updateOrganizationAgentSettingsEndpoint,
} from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslations } from "use-intl";
import { adminAgentSettingsKeys, listedAgentKeys } from "#/entities/agent-settings/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { RadioGroup, RadioGroupItem } from "#/shared/ui/atoms/RadioGroup/RadioGroup.tsx";
import { Switch } from "#/shared/ui/atoms/Switch/Switch.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

export type AgentEnablementPanelProps = {
  organizationId: string;
  organizationName: string;
  settings: AgentSettings;
  /** Ids of every subagent the runtime registered; without them the list is the core ones plus the enabled ones. */
  registeredAgents?: readonly string[] | undefined;
};

type Change = { patch: UpdateAgentSettingsInput; next: AgentSettings; done: string };
/** A change that widens what reaches the model or the web: it waits for a confirmation. */
type RiskyChange = { readonly kind: "pii" } | { readonly kind: "web"; readonly tool: "firecrawl" | "browser" };
type Failure = { message: string; requestId: string | undefined };

/**
 * Applies one change at a time: the control flips at once (optimistic), the `PUT` sends only the
 * changed setting, and a failure puts the previous value back and shows why.
 */
const useSaveAgentSettings = (organizationId: string) => {
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const describe = useDescribeError();
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const save = async (current: AgentSettings, change: Change): Promise<void> => {
    const key = adminAgentSettingsKeys.one(organizationId);
    setFailure(null);
    setSaving(true);
    queryClient.setQueryData(key, change.next);
    try {
      const { data } = await callEndpoint(updateOrganizationAgentSettingsEndpoint, {
        params: { organizationId },
        body: change.patch,
      });
      queryClient.setQueryData(key, data);
      notify.success(change.done);
    } catch (error: unknown) {
      queryClient.setQueryData(key, current);
      const described = describe(error);
      setFailure({ message: described.message, requestId: described.requestId });
    } finally {
      setSaving(false);
    }
  };
  return { save, saving, failure };
};

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string | undefined;
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
        {description === undefined ? null : (
          <span id={`${id}-hint`} className="text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        {...(description === undefined ? {} : { "aria-describedby": `${id}-hint` })}
      />
    </li>
  );
}

function Group({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1">
      <h3 id={id} className="text-sm font-medium">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}

function PiiMode({
  value,
  disabled,
  onChange,
}: {
  value: "warn" | "redact";
  disabled: boolean;
  onChange: (mode: "warn" | "redact") => void;
}) {
  const t = useTranslations("admin.agentSettings.pii");
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

function SaveFailureAlert({ failure }: { failure: Failure }) {
  const t = useTranslations("admin.agentSettings");
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("failed")}</AlertTitle>
      <AlertDescription>
        {failure.requestId === undefined
          ? failure.message
          : t("failedWithReference", { message: failure.message, requestId: failure.requestId })}
      </AlertDescription>
    </Alert>
  );
}

/** Asks before a risky change, naming the organization; `onConfirm` receives the change that was asked about. */
function ConfirmRiskyChangeDialog({
  risky,
  organizationName,
  onClose,
  onConfirm,
}: {
  risky: RiskyChange | null;
  organizationName: string;
  onClose: () => void;
  onConfirm: (change: RiskyChange) => void;
}) {
  const t = useTranslations("admin.agentSettings");
  return (
    <ConfirmDialog
      open={risky !== null}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={
        risky?.kind === "web"
          ? t(`confirm.${risky.tool}Title`, { organization: organizationName })
          : t("confirm.piiTitle", { organization: organizationName })
      }
      description={risky?.kind === "web" ? t("confirm.webDescription") : t("confirm.piiDescription")}
      confirmLabel={risky?.kind === "web" ? t("confirm.webConfirm") : t("confirm.piiConfirm")}
      destructive={risky?.kind === "pii"}
      onConfirm={() => {
        if (risky !== null) onConfirm(risky);
      }}
    />
  );
}

/**
 * Agent settings of one organization edited by staff (`PUT /v1/admin/organizations/{id}/agent-settings`,
 * platform.agent.manage, audited with the organization as target): which subagents the supervisor
 * may delegate to, the web tool opt-ins and the PII guardrail mode. Each control saves on change;
 * turning a web tool on and weakening PII from "redact" to "warn" ask first, naming the
 * organization (a misclick would send personal data or reach the web for all its members).
 */
export function AgentEnablementPanel({
  organizationId,
  organizationName,
  settings,
  registeredAgents,
}: AgentEnablementPanelProps) {
  const t = useTranslations("admin.agentSettings");
  const names = useTranslations("admin.agents.names");
  const roles = useTranslations("admin.agents.roles");
  const online = useOnlineStatus();
  const { save, saving, failure } = useSaveAgentSettings(organizationId);
  const disabled = saving || !online;
  const [risky, setRisky] = useState<RiskyChange | null>(null);
  const agentName = (key: string): string => (names.has(key) ? names(key) : key);

  const toggleAgent = (key: string, enabled: boolean): void => {
    const enabledAgents = enabled
      ? [...settings.enabledAgents, key]
      : settings.enabledAgents.filter((agent) => agent !== key);
    const done = enabled
      ? t("agentEnabled", { agent: agentName(key), organization: organizationName })
      : t("agentDisabled", { agent: agentName(key), organization: organizationName });
    void save(settings, { patch: { enabledAgents }, next: { ...settings, enabledAgents }, done });
  };
  const toggleWebTool = (tool: "firecrawl" | "browser", enabled: boolean): void => {
    if (enabled && risky === null) {
      setRisky({ kind: "web", tool });
      return;
    }
    const webTools = { ...settings.webTools, [tool]: enabled };
    void save(settings, {
      patch: { webTools },
      next: { ...settings, webTools },
      done: t("saved", { organization: organizationName }),
    });
  };
  const setPii = (pii: "warn" | "redact"): void => {
    if (pii === "warn" && risky === null) {
      setRisky({ kind: "pii" });
      return;
    }
    const guardrails = { pii };
    void save(settings, {
      patch: { guardrails },
      next: { ...settings, guardrails },
      done: t("saved", { organization: organizationName }),
    });
  };

  return (
    <div data-slot="agent-enablement" aria-busy={saving || undefined} className="flex flex-col gap-6">
      {failure === null ? null : <SaveFailureAlert failure={failure} />}
      {online ? null : <p className="text-xs text-muted-foreground">{t("offline")}</p>}
      <Group title={t("agents.title")} description={t("agents.description")}>
        <ul className="divide-y divide-border">
          {listedAgentKeys(settings, registeredAgents).map((key) => (
            <ToggleRow
              key={key}
              label={agentName(key)}
              description={roles.has(key) ? roles(key) : undefined}
              checked={settings.enabledAgents.includes(key)}
              disabled={disabled}
              onChange={(enabled) => toggleAgent(key, enabled)}
            />
          ))}
        </ul>
      </Group>
      <Group title={t("webTools.title")} description={t("webTools.description")}>
        <ul className="divide-y divide-border">
          <ToggleRow
            label={t("webTools.firecrawl")}
            description={t("webTools.firecrawlHint")}
            checked={settings.webTools.firecrawl}
            disabled={disabled}
            onChange={(enabled) => toggleWebTool("firecrawl", enabled)}
          />
          <ToggleRow
            label={t("webTools.browser")}
            description={t("webTools.browserHint")}
            checked={settings.webTools.browser}
            disabled={disabled}
            onChange={(enabled) => toggleWebTool("browser", enabled)}
          />
        </ul>
      </Group>
      <PiiMode value={settings.guardrails.pii} disabled={disabled} onChange={setPii} />
      <ConfirmRiskyChangeDialog
        risky={risky}
        organizationName={organizationName}
        onClose={() => setRisky(null)}
        onConfirm={(change) => {
          // The dialog closes at once; the save shows its own outcome (toast or the alert above).
          if (change.kind === "web") toggleWebTool(change.tool, true);
          else setPii("warn");
        }}
      />
    </div>
  );
}
