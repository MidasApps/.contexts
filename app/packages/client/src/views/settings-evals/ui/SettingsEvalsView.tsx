"use client";

import type { AccessContext } from "@core/contracts";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { StartEvalExperimentDialog } from "#/features/start-eval-experiment/index.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { searchOption, useSettingsSearch } from "#/shared/lib/router/use-route-search.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/shared/ui/molecules/Tabs/Tabs.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";
import { DatasetsPanel } from "./DatasetsPanel.tsx";
import { ExperimentsPanel } from "./ExperimentsPanel.tsx";

const TABS = ["experiments", "datasets"] as const;
type EvalTab = (typeof TABS)[number];
const isTab = (value: string): value is EvalTab => (TABS as readonly string[]).includes(value);

function EvalsContent({ organization, onStart }: { organization: { id: string; name: string }; onStart: (() => void) | null }) {
  const t = useTranslations("settings.evals");
  const online = useOnlineStatus();
  const search = useSettingsSearch(["tab"]);
  const tab = searchOption<EvalTab>(search.values.tab, TABS, "experiments");
  // Switching tabs drops the experiments' page: it belongs to the other tab.
  const setTab = (next: EvalTab): void => search.set({ tab: next === "experiments" ? undefined : next });
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
          {tab === "datasets" ? <DatasetsPanel organization={organization} onSeeExperiments={() => setTab("experiments")} /> : null}
        </TabsContent>
      </Tabs>
      {/* The tenant API lists datasets but has no endpoint for their items: say so instead of hiding it. */}
      <Alert>
        <AlertTitle>{t("limits.title")}</AlertTitle>
        <AlertDescription>{t("limits.description")}</AlertDescription>
      </Alert>
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
      <EvalsContent organization={organization} onStart={canStart && online ? () => setStarting(true) : null} />
      {canStart ? <StartEvalExperimentDialog organizationId={organization.id} open={starting} onOpenChange={setStarting} /> : null}
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/evals` (SP5 spec §7, core.eval.read): the organization's
 * experiments with scores, verdict and a two-experiment comparison, its datasets, and starting
 * an experiment of an enabled agent (core.eval.write).
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
