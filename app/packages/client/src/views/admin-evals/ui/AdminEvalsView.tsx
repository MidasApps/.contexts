"use client";

import { useTranslations } from "use-intl";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/shared/ui/molecules/Tabs/Tabs.tsx";
import { AdminPageFrame } from "#/widgets/admin-nav/index.ts";
import { EVAL_TABS, useEvalsUrl, type EvalTab } from "../model/use-evals-url.ts";
import { DatasetsPanel } from "./DatasetsPanel.tsx";
import { ExperimentsPanel } from "./ExperimentsPanel.tsx";

const isTab = (value: string): value is EvalTab => (EVAL_TABS as readonly string[]).includes(value);

/**
 * `/admin/evals` (SP5 spec §6, §8, platform.eval.manage): experiments (CI eval runs, prompt evals
 * and tenant experiments) with scores per scorer, the gate verdict and a two-experiment
 * comparison, and the datasets they run on. Tab, page and comparison live in the URL. Only the
 * open tab loads its data, and only for a role that holds the permission.
 */
export function AdminEvalsView() {
  const t = useTranslations("admin.evals");
  const permissions = usePlatformPermissions();
  const url = useEvalsUrl();
  return (
    <AdminPageFrame permission="platform.eval.manage" title={t("title")} description={t("description")}>
      {permissions.can("platform.eval.manage") ? (
        <Tabs value={url.tab} onValueChange={(value) => isTab(value) && url.setTab(value)}>
          <TabsList variant="line" aria-label={t("tabs.label")}>
            <TabsTrigger value="experiments">{t("tabs.experiments")}</TabsTrigger>
            <TabsTrigger value="datasets">{t("tabs.datasets")}</TabsTrigger>
          </TabsList>
          <TabsContent value="experiments" className="pt-3">
            <ExperimentsPanel url={url} />
          </TabsContent>
          <TabsContent value="datasets" className="pt-3">
            <DatasetsPanel onSeeExperiments={() => url.setTab("experiments")} />
          </TabsContent>
        </Tabs>
      ) : null}
    </AdminPageFrame>
  );
}
