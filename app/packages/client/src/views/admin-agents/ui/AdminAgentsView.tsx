"use client";

import { PROMPT_AGENT_IDS, type PromptAgentId } from "@core/contracts";
import { useRef } from "react";
import { useTranslations } from "use-intl";
import { useAllAdminOrganizations } from "#/entities/admin-organization/index.ts";
import { useAdminAgentSettings } from "#/entities/agent-settings/index.ts";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { AgentEnablementPanel } from "#/features/admin-agent-enablement/index.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { AdminOrganizationFilter, AdminPageFrame, AdminQuerySection, useAdminSearch } from "#/widgets/admin-nav/index.ts";

function PromptAgentRow({ agentId, canManagePrompts }: { agentId: PromptAgentId; canManagePrompts: boolean }) {
  const t = useTranslations("admin.agents");
  const name = t(`names.${agentId}`);
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex min-w-0 items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon name="bot" className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium">{name}</span>
            <span className="font-mono text-[11.5px] text-muted-foreground">{agentId}</span>
          </span>
          <span className="text-sm text-muted-foreground">{t(`roles.${agentId}`)}</span>
        </span>
      </span>
      {canManagePrompts ? (
        <Button variant="outline" size="sm" asChild className="self-start sm:self-auto">
          <RouteLink to={{ id: "admin", rest: `agents/${agentId}/prompts` }} aria-label={t("openPromptsNamed", { agent: name })}>
            {t("openPrompts")}
          </RouteLink>
        </Button>
      ) : null}
    </li>
  );
}

function OrganizationAgents({ organizationId }: { organizationId: string }) {
  const t = useTranslations("admin.agents");
  const settings = useAdminAgentSettings(organizationId);
  const organizations = useAllAdminOrganizations();
  const organizationName = organizations.data?.find((organization) => organization.id === organizationId)?.name ?? organizationId;
  return (
    <AdminQuerySection query={settings} loadingLabel={t("organization.loading")} rows={6}>
      {(data) => <AgentEnablementPanel organizationId={organizationId} organizationName={organizationName} settings={data} />}
    </AdminQuerySection>
  );
}

function OrganizationSection() {
  const t = useTranslations("admin.agents");
  const search = useAdminSearch(["organizationId"]);
  const picker = useRef<HTMLDivElement>(null);
  const organizationId = search.values.organizationId;
  const openPicker = (): void => picker.current?.querySelector<HTMLElement>("[role='combobox']")?.click();
  return (
    <SectionCard title={t("organization.title")} description={t("organization.description")}>
      <div ref={picker} className="sm:max-w-sm">
        <AdminOrganizationFilter required value={organizationId} onValueChange={(next) => search.set({ organizationId: next })} />
      </div>
      {organizationId === undefined ? (
        <EmptyState
          headingLevel={3}
          icon="building"
          title={t("organization.emptyTitle")}
          description={t("organization.emptyDescription")}
          action={
            <Button variant="secondary" onClick={openPicker}>
              {t("organization.emptyAction")}
            </Button>
          }
        />
      ) : (
        <OrganizationAgents key={organizationId} organizationId={organizationId} />
      )}
    </SectionCard>
  );
}

/**
 * `/admin/agents` (SP5 spec §6, platform.agent.manage): the core agents with their platform
 * prompts, and one organization's agent settings (chosen in the URL: `?organizationId=`). There
 * is no agents catalog endpoint, so the list is the core prompt agents; for an organization, the
 * core subagents plus whatever else it has enabled.
 */
export function AdminAgentsView() {
  const t = useTranslations("admin.agents");
  const permissions = usePlatformPermissions();
  const canManagePrompts = permissions.can("platform.prompt.manage");
  return (
    <AdminPageFrame permission="platform.agent.manage" title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-6">
        <SectionCard title={t("catalog.title")} description={t("catalog.description")}>
          <ul aria-label={t("catalog.title")} className="divide-y divide-border">
            {PROMPT_AGENT_IDS.map((agentId) => (
              <PromptAgentRow key={agentId} agentId={agentId} canManagePrompts={canManagePrompts} />
            ))}
          </ul>
        </SectionCard>
        <OrganizationSection />
      </div>
    </AdminPageFrame>
  );
}
