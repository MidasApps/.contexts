"use client";

import { useRef } from "react";
import { useTranslations } from "use-intl";
import { useAdminAgentCatalog } from "#/entities/admin-agent/index.ts";
import { useAllAdminOrganizations } from "#/entities/admin-organization/index.ts";
import { useAdminAgentSettings } from "#/entities/agent-settings/index.ts";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { AgentEnablementPanel } from "#/features/admin-agent-enablement/index.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { AdminOrganizationFilter, AdminPageFrame, AdminQuerySection, useAdminSearch } from "#/widgets/admin-nav/index.ts";
import { AgentCatalogSection } from "./AgentCatalogSection.tsx";

function OrganizationAgents({ organizationId }: { organizationId: string }) {
  const t = useTranslations("admin.agents");
  const settings = useAdminAgentSettings(organizationId);
  const organizations = useAllAdminOrganizations();
  const organizationName = organizations.data?.find((organization) => organization.id === organizationId)?.name ?? organizationId;
  // Every registered subagent can be switched on, a module's too (the catalog is already cached by the section above).
  const subagents = useAdminAgentCatalog().data?.filter((agent) => agent.role === "subagent").map((agent) => agent.id);
  return (
    <AdminQuerySection query={settings} loadingLabel={t("organization.loading")} rows={6}>
      {(data) => <AgentEnablementPanel organizationId={organizationId} organizationName={organizationName} settings={data} registeredAgents={subagents} />}
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
 * `/admin/agents` (SP5 spec §6, platform.agent.manage): the agents the runtime registered, with
 * their subagents, tools, skills and permissions (decision 0044) and a link to the prompt versions
 * of the ones that have a prompt; and one organization's agent settings (chosen in the URL:
 * `?organizationId=`), where every registered subagent can be switched on or off.
 */
export function AdminAgentsView() {
  const t = useTranslations("admin.agents");
  const permissions = usePlatformPermissions();
  const canManagePrompts = permissions.can("platform.prompt.manage");
  return (
    <AdminPageFrame permission="platform.agent.manage" title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-6">
        <AgentCatalogSection canManagePrompts={canManagePrompts} />
        <OrganizationSection />
      </div>
    </AdminPageFrame>
  );
}
