"use client";

import type { AgentCatalogEntry, CustomAgentOptions } from "@core/contracts";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { useCustomAgentOptions } from "#/entities/custom-agent/index.ts";
import { CustomAgentEditorDialog, DeleteCustomAgentDialog, ToggleCustomAgentDialog, type CustomAgentRef } from "#/features/custom-agent-editor/index.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { QuerySection } from "#/widgets/page-state/index.ts";
import { AgentCard } from "./AgentCard.tsx";

type CardActions = { edit: (agent: CustomAgentRef) => void; toggle: (agent: CustomAgentRef) => void; remove: (agent: CustomAgentRef) => void };

const refOf = (agent: AgentCatalogEntry): CustomAgentRef => ({ id: agent.key, name: agent.name, enabled: agent.enabled });

function AgentStatus({ agent, actions }: { agent: AgentCatalogEntry; actions: CardActions | null }) {
  const t = useTranslations("settings.agents.custom");
  const { name } = agent;
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <StatusPill tone={agent.enabled ? "emerald" : "neutral"}>{agent.enabled ? t("enabled") : t("disabled")}</StatusPill>
      {actions === null ? null : (
        <span className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={() => actions.edit(refOf(agent))} aria-label={t("actions.editNamed", { name })}>
            {t("actions.edit")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => actions.toggle(refOf(agent))} aria-label={t(agent.enabled ? "actions.disableNamed" : "actions.enableNamed", { name })}>
            {t(agent.enabled ? "actions.disable" : "actions.enable")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => actions.remove(refOf(agent))} aria-label={t("actions.deleteNamed", { name })}>
            {t("actions.delete")}
          </Button>
        </span>
      )}
    </div>
  );
}

type SectionProps = { organizationId: string; agents: readonly AgentCatalogEntry[]; canUpdate: boolean; options: CustomAgentOptions };

function OwnAgents({ organizationId, agents, canUpdate, options }: SectionProps) {
  const t = useTranslations("settings.agents.custom");
  const online = useOnlineStatus();
  const [editor, setEditor] = useState<{ agent: CustomAgentRef | null } | null>(null);
  const [toggling, setToggling] = useState<CustomAgentRef | null>(null);
  const [removing, setRemoving] = useState<CustomAgentRef | null>(null);
  const capReached = options.usage.agents >= options.limits.maxAgents;
  const actions: CardActions | null = canUpdate && online ? { edit: (agent) => setEditor({ agent }), toggle: setToggling, remove: setRemoving } : null;
  return (
    <SectionCard
      title={t("title")}
      description={t("description")}
      actions={
        canUpdate ? (
          <Button onClick={() => setEditor({ agent: null })} disabled={!online || capReached}>
            <Icon name="plus" />
            {t("create")}
          </Button>
        ) : undefined
      }
    >
      <p className="text-sm text-muted-foreground">
        {t("usage", { used: options.usage.agents, maximum: options.limits.maxAgents })} {capReached ? t("capReached") : null} {canUpdate ? null : t("readOnly")}
      </p>
      {agents.length === 0 ? (
        <EmptyState frame="plain" headingLevel={3} icon="bot" title={t("emptyTitle")} description={canUpdate ? t("emptyDescription") : t("emptyDescriptionNoPermission")} />
      ) : (
        <div className="flex flex-col gap-4">
          {agents.map((agent) => (
            // An organization's agent has its instructions in its own record, not in the prompt store.
            <AgentCard key={agent.key} organizationId={organizationId} agent={agent} prompt={{ canRead: false, canWrite: false }} status={<AgentStatus agent={agent} actions={actions} />} />
          ))}
        </div>
      )}
      {canUpdate ? (
        <>
          <CustomAgentEditorDialog organizationId={organizationId} open={editor !== null} agent={editor?.agent ?? null} options={options} onOpenChange={(open) => !open && setEditor(null)} />
          <ToggleCustomAgentDialog organizationId={organizationId} agent={toggling} onOpenChange={(open) => !open && setToggling(null)} />
          <DeleteCustomAgentDialog organizationId={organizationId} agent={removing} onOpenChange={(open) => !open && setRemoving(null)} />
        </>
      ) : null}
    </SectionCard>
  );
}

/**
 * The organization's own agents (decision 0046), from the catalog entries with `source: "custom"`:
 * create, edit, enable or disable and delete. Writing needs core.agent-settings.update; a reader
 * sees the cards only. The options give the plan's limits, so the section waits for them.
 */
export function OrganizationAgents(props: Omit<SectionProps, "options">) {
  const t = useTranslations("settings.agents.custom");
  const options = useCustomAgentOptions(props.organizationId);
  return (
    <QuerySection query={options} loadingLabel={t("loading")}>
      {(data) => <OwnAgents {...props} options={data} />}
    </QuerySection>
  );
}
