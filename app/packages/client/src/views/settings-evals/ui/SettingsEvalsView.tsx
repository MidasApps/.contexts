"use client";

import type { AccessContext } from "@core/contracts";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { CreateEvalDatasetDialog } from "#/features/manage-eval-datasets/index.ts";
import { StartEvalExperimentDialog } from "#/features/start-eval-experiment/index.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { searchOption, useSettingsSearch } from "#/shared/lib/router/use-route-search.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/shared/ui/molecules/Tabs/Tabs.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";
import { DatasetItemsPanel } from "./DatasetItemsPanel.tsx";
import { DatasetsPanel } from "./DatasetsPanel.tsx";
import { ExperimentsPanel } from "./ExperimentsPanel.tsx";

const TABS = ["experiments", "datasets"] as const;
type EvalTab = (typeof TABS)[number];
const isTab = (value: string): value is EvalTab => (TABS as readonly string[]).includes(value);

type EvalsContentProps = { organization: { id: string; name: string }; onStart: (() => void) | null; canWrite: boolean };

function EvalsContent({ organization, onStart, canWrite }: EvalsContentProps) {
  const t = useTranslations("settings.evals");
  const online = useOnlineStatus();
  const search = useSettingsSearch(["tab", "dataset"]);
  const tab = searchOption<EvalTab>(search.values.tab, TABS, "experiments");
  const datasetId = tab === "datasets" ? search.values.dataset : undefined;
  const [creating, setCreating] = useState(false);
  // Switching tabs drops the page and the open dataset: they belong to the other tab.
  const setTab = (next: EvalTab): void => search.set({ tab: next === "experiments" ? undefined : next, dataset: undefined });
  const openItems = (id: string): void => search.set({ tab: "datasets", dataset: id });
  const writable = canWrite && online;
  return (
    <div className="flex flex-col gap-4">
      {online ? null : <OfflineNotice />}
      <Tabs value={tab} onValueChange={(value) => isTab(value) && setTab(value)}>
        <TabsList variant="line" aria-label={t("tabs.label")}>
          <TabsTrigger value="experiments">{t("tabs.experiments")}</TabsTrigger>
          <TabsTrigger value="datasets">{t("tabs.datasets")}</TabsTrigger>
        </TabsList>
        {/* Only the open tab mounts, so only it loads its data. */}
        <TabsContent value="experiments" className="pt-3">
          {tab === "experiments" ? <ExperimentsPanel organization={organization} onStart={onStart} /> : null}
        </TabsContent>
        <TabsContent value="datasets" className="pt-3">
          {tab !== "datasets" ? null : datasetId === undefined ? (
            <DatasetsPanel organization={organization} onSeeExperiments={() => setTab("experiments")} onOpenItems={openItems} onCreate={writable ? () => setCreating(true) : null} />
          ) : (
            <DatasetItemsPanel organization={organization} datasetId={datasetId} canWrite={writable} onBack={() => search.set({ dataset: undefined })} />
          )}
        </TabsContent>
      </Tabs>
      {canWrite ? <CreateEvalDatasetDialog organizationId={organization.id} open={creating} onOpenChange={setCreating} onCreated={(dataset) => openItems(dataset.id)} /> : null}
    </div>
  );
}

function SettingsEvals({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.evals");
  const online = useOnlineStatus();
  const { organization } = context;
  const [starting, setStarting] = useState(false);
  const allowed = context.permissions.includes("core.eval.read");
  const canStart = context.permissions.includes("core.eval.write");
  return (
    <SettingsPageFrame width="wide"
      organizationId={organization.id}
      allowed={allowed}
      header={
        <PageHeader
          eyebrow={t("eyebrow", { organization: organization.name })}
          title={t("title")}
          description={t("description")}
          actions={
            allowed && canStart ? (
              <Button onClick={() => setStarting(true)} disabled={!online}>
                <Icon name="plus" />
                {t("start.action")}
              </Button>
            ) : undefined
          }
        />
      }
    >
      <EvalsContent organization={organization} onStart={canStart && online ? () => setStarting(true) : null} canWrite={canStart} />
      {canStart ? <StartEvalExperimentDialog organizationId={organization.id} open={starting} onOpenChange={setStarting} /> : null}
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/evals` (SP5 spec §7, core.eval.read): the organization's
 * experiments with scores, verdict and a two-experiment comparison, its datasets and their items,
 * and, with core.eval.write, starting an experiment, creating a dataset and adding or deleting
 * items (decision 0062).
 */
export function SettingsEvalsView() {
  const t = useTranslations("settings.evals");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsEvals context={data} />}
    </QueryPage>
  );
}
