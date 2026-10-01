"use client";

import { useTranslations } from "use-intl";
import { useAllAdminOrganizations } from "#/entities/admin-organization/index.ts";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/shared/ui/molecules/Tabs/Tabs.tsx";
import { AdminPageFrame, useAdminSearch } from "#/widgets/admin-nav/index.ts";
import { RunsPanel } from "./RunsPanel.tsx";
import { SchedulesPanel } from "./SchedulesPanel.tsx";

const TABS = ["runs", "schedules"] as const;
type Tab = (typeof TABS)[number];
const isTab = (value: string | undefined): value is Tab => value !== undefined && (TABS as readonly string[]).includes(value);

/**
 * `/admin/workflows` (SP5 spec §6, platform.workflow.manage): workflow runs of every organization
 * (suspended ones wait for an approval; a live run can be cancelled) and the platform and tenant
 * schedules (pause, resume, run now). Tab and filters live in the URL; only the open tab loads.
 */
export function AdminWorkflowsView() {
  const t = useTranslations("admin.workflows");
  const permissions = usePlatformPermissions();
  const allowed = permissions.can("platform.workflow.manage");
  const search = useAdminSearch(["tab", "organizationId", "workflowId", "status"]);
  const tab: Tab = isTab(search.values.tab) ? search.values.tab : "runs";
  const organizations = useAllAdminOrganizations({ enabled: allowed });
  const organizationLabel = (tenantId: string | null): string =>
    tenantId === null ? t("platform") : (organizations.data?.find((organization) => organization.id === tenantId)?.name ?? tenantId);
  const setTab = (next: Tab): void => search.set({ tab: next === "runs" ? undefined : next });
  return (
    <AdminPageFrame permission="platform.workflow.manage" title={t("title")} description={t("description")}>
      {allowed ? (
        <Tabs value={tab} onValueChange={(value) => isTab(value) && setTab(value)}>
          <TabsList variant="line" aria-label={t("tabs.label")}>
            <TabsTrigger value="runs">{t("tabs.runs")}</TabsTrigger>
            <TabsTrigger value="schedules">{t("tabs.schedules")}</TabsTrigger>
          </TabsList>
          <TabsContent value="runs" className="pt-3">
            {tab === "runs" ? (
              <RunsPanel
                values={{ organizationId: search.values.organizationId, workflowId: search.values.workflowId, status: search.values.status }}
                onChange={search.set}
                organizationLabel={organizationLabel}
                onSeeSchedules={() => setTab("schedules")}
              />
            ) : null}
          </TabsContent>
          <TabsContent value="schedules" className="pt-3">
            {tab === "schedules" ? (
              <SchedulesPanel organizationId={search.values.organizationId} onOrganizationChange={(organizationId) => search.set({ organizationId })} organizationLabel={organizationLabel} />
            ) : null}
          </TabsContent>
        </Tabs>
      ) : null}
    </AdminPageFrame>
  );
}
