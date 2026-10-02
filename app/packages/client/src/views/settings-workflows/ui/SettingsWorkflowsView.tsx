"use client";

import type { AccessContext } from "@core/contracts";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { useWorkflowCatalog } from "#/entities/workflow-run/index.ts";
import { StartWorkflowRunDialog } from "#/features/start-workflow-run/index.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { searchOption, useSettingsSearch } from "#/shared/lib/router/use-route-search.ts";
import { RouteLink, useRouter } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/shared/ui/molecules/Tabs/Tabs.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";
import { RunPage } from "./RunPage.tsx";
import { RunsSection } from "./RunsSection.tsx";
import { SchedulesSection } from "./SchedulesSection.tsx";

const RUN_PAGE = /^runs\/([A-Za-z0-9_-]{1,128})$/u;

function WorkflowsHome({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.workflows");
  const online = useOnlineStatus();
  const router = useRouter();
  const { organization } = context;
  const canRead = context.permissions.includes("core.workflow-run.read");
  const canStart = context.permissions.includes("core.workflow-run.start");
  const canSeeSchedules = context.permissions.includes("core.schedule.read");
  const catalog = useWorkflowCatalog(organization.id, { enabled: canRead });
  const workflows = catalog.data ?? [];
  const [starting, setStarting] = useState(false);
  // The tab lives in the URL: a reload, a shared link or "back" from a run keeps it.
  const search = useSettingsSearch(["tab"]);
  const tab = searchOption(search.values.tab, ["runs", "schedules"], "runs");
  const startable = workflows.some((workflow) => workflow.startable);
  const openStart = canStart && online && startable ? () => setStarting(true) : null;
  const runs = <RunsSection context={context} workflows={workflows} onStart={openStart} online={online} />;
  return (
    <SettingsPageFrame width="wide"
      organizationId={organization.id}
      allowed={canRead}
      header={
        <PageHeader
          eyebrow={t("eyebrow", { organization: organization.name })}
          title={t("title")}
          description={t("description")}
          actions={
            canStart ? (
              <Button onClick={() => setStarting(true)} disabled={openStart === null}>
                <Icon name="plus" />
                {t("runs.start")}
              </Button>
            ) : undefined
          }
        />
      }
    >
      <div className="flex flex-col gap-4">
        {online ? null : <OfflineNotice />}
        {catalog.isError ? (
          <Alert variant="warning">
            <AlertDescription className="text-inherit">{t("catalogFailed")}</AlertDescription>
          </Alert>
        ) : null}
        {canSeeSchedules ? (
          <Tabs value={tab} onValueChange={(value) => search.set({ tab: value === "schedules" ? "schedules" : undefined })}>
            <TabsList aria-label={t("tabsLabel")}>
              <TabsTrigger value="runs">{t("tabs.runs")}</TabsTrigger>
              <TabsTrigger value="schedules">{t("tabs.schedules")}</TabsTrigger>
            </TabsList>
            <TabsContent value="runs">{runs}</TabsContent>
            <TabsContent value="schedules">
              <SchedulesSection context={context} workflows={workflows} online={online} />
            </TabsContent>
          </Tabs>
        ) : (
          runs
        )}
      </div>
      {canStart ? (
        <StartWorkflowRunDialog
          organizationId={organization.id}
          workflows={workflows}
          open={starting}
          onOpenChange={setStarting}
          onStarted={(runId) => router.navigate({ id: "settings", organizationId: organization.id, section: "workflows", rest: `runs/${runId}` })}
        />
      ) : null}
    </SettingsPageFrame>
  );
}

function UnknownPage({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.workflows");
  const { organization } = context;
  return (
    <SettingsPageFrame width="wide"
      organizationId={organization.id}
      allowed={context.permissions.includes("core.workflow-run.read")}
      header={<PageHeader eyebrow={t("eyebrow", { organization: organization.name })} title={t("title")} />}
    >
      <EmptyState
        headingLevel={2}
        icon="search"
        title={t("notFoundTitle")}
        description={t("notFoundDescription")}
        action={
          <Button variant="secondary" asChild>
            <RouteLink to={{ id: "settings", organizationId: organization.id, section: "workflows" }}>{t("backToRuns")}</RouteLink>
          </Button>
        }
      />
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/workflows` (SP5 spec §7; core.workflow-run.read): the
 * organization's workflow runs (start, follow, cancel) and, for holders of core.schedule.read,
 * its schedules. `…/workflows/runs/:runId` is the page of one run; any other tail is not found
 * inside the settings frame.
 */
export function SettingsWorkflowsView() {
  const t = useTranslations("settings.workflows");
  const node = useCurrentNode();
  const rest = useRouter().useRouteParams()["rest"];
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  const runId = rest === undefined ? undefined : RUN_PAGE.exec(rest)?.[1];
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => {
        if (rest === undefined || rest === "") return <WorkflowsHome context={data} />;
        return runId === undefined ? <UnknownPage context={data} /> : <RunPage context={data} runId={runId} />;
      }}
    </QueryPage>
  );
}
