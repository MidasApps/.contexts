"use client";

import type { AccessContext, AgentCatalogEntry, AgentSettings } from "@core/contracts";
import { useTranslations } from "use-intl";
import { useAgentCatalog } from "#/entities/agent-catalog/index.ts";
import { useTenantAgentSettings } from "#/entities/agent-settings/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { AgentEnabledSwitch, OrganizationAgentRules } from "#/features/tenant-agent-settings/index.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage, QuerySection } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";
import { AgentCard } from "./AgentCard.tsx";
import { OrganizationAgents } from "./OrganizationAgents.tsx";

// The supervisor is not a subagent of the catalog, but it has a versioned prompt of its own.
const SUPERVISOR_KEY = "assistant";

type Viewer = { readonly canUpdate: boolean; readonly prompt: { readonly canRead: boolean; readonly canWrite: boolean } };

function AgentList({ organizationId, catalog, settings, viewer }: { organizationId: string; catalog: readonly AgentCatalogEntry[]; settings: AgentSettings; viewer: Viewer }) {
  const t = useTranslations("settings.agents");
  return (
    <div className="flex flex-col gap-4">
      {viewer.prompt.canRead ? (
        <AgentCard
          organizationId={organizationId}
          agent={{ key: SUPERVISOR_KEY, name: t("assistant.name"), description: t("assistant.description"), source: "core", moduleId: null, tools: [], skills: [] }}
          prompt={viewer.prompt}
        />
      ) : null}
      {catalog.length === 0 ? (
        <EmptyState frame="plain" headingLevel={3} icon="bot" title={t("catalog.emptyTitle")} description={t("catalog.emptyDescription")} />
      ) : (
        catalog.map((agent) => (
          <AgentCard
            key={agent.key}
            organizationId={organizationId}
            agent={agent}
            prompt={viewer.prompt}
            status={<AgentEnabledSwitch organizationId={organizationId} agent={agent} settings={settings} canUpdate={viewer.canUpdate} />}
          />
        ))
      )}
    </div>
  );
}

function AgentsContent({ organizationId, viewer }: { organizationId: string; viewer: Viewer }) {
  const t = useTranslations("settings.agents");
  const online = useOnlineStatus();
  const catalog = useAgentCatalog(organizationId);
  const settings = useTenantAgentSettings(organizationId);
  return (
    <div className="flex flex-col gap-5">
      {online ? null : <OfflineNotice />}
      <Alert>
        <AlertDescription className="flex flex-col gap-2">
          <span>{t("intro")}</span>
          <span className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <RouteLink to={{ id: "settings", organizationId, section: "connectors" }}>{t("connectorsLink")}</RouteLink>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <RouteLink to={{ id: "settings", organizationId, section: "skills" }}>{t("skillsLink")}</RouteLink>
            </Button>
          </span>
        </AlertDescription>
      </Alert>
      <QuerySection query={settings} loadingLabel={t("loading")}>
        {(settingsData) => (
          <>
            <QuerySection query={catalog} loadingLabel={t("loading")}>
              {(catalogData) => (
                <>
                  <OrganizationAgents organizationId={organizationId} agents={catalogData.filter((agent) => agent.source === "custom")} canUpdate={viewer.canUpdate} />
                  <SectionCard title={t("catalog.title")} description={t("catalog.description")}>
                    <AgentList organizationId={organizationId} catalog={catalogData.filter((agent) => agent.source !== "custom")} settings={settingsData} viewer={viewer} />
                  </SectionCard>
                </>
              )}
            </QuerySection>
            <SectionCard title={t("organization.title")} description={t("organization.description")}>
              <OrganizationAgentRules organizationId={organizationId} settings={settingsData} canUpdate={viewer.canUpdate} />
            </SectionCard>
          </>
        )}
      </QuerySection>
    </div>
  );
}

function SettingsAgents({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.agents");
  const { organization, permissions } = context;
  const viewer: Viewer = {
    canUpdate: permissions.includes("core.agent-settings.update"),
    prompt: { canRead: permissions.includes("core.prompt.read"), canWrite: permissions.includes("core.prompt.write") },
  };
  return (
    <SettingsPageFrame
      organizationId={organization.id}
      allowed={permissions.includes("core.agent-settings.read")}
      header={<PageHeader eyebrow={t("eyebrow", { organization: organization.name })} title={t("title")} description={t("description")} />}
    >
      <AgentsContent organizationId={organization.id} viewer={viewer} />
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/agents` (SP5 spec §7, core.agent-settings.read): the agents the
 * platform and the installed modules offer to the organization, each with its switch, tools,
 * skills and the organization's instructions; the organization's own agents, which an admin
 * creates, edits, enables and deletes (decision 0046); plus the rules for all of them (web tools, PII).
 */
export function SettingsAgentsView() {
  const t = useTranslations("settings.agents");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsAgents context={data} />}
    </QueryPage>
  );
}
