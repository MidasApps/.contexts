"use client";

import type { AgentSettings } from "@core/contracts";
import { useTranslations } from "use-intl";
import { ModuleEnabledSwitch } from "#/features/tenant-agent-settings/index.ts";
import { useModuleLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { useModuleRegistry } from "#/shared/lib/shell/shell-registry-context.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";

export type InstalledModulesProps = {
  organizationId: string;
  settings: AgentSettings;
  canUpdate: boolean;
};

/**
 * The modules installed in this client, one switch each (decision 0064): a module with no agents,
 * like the example module, is enabled here. The settings are already loaded by the page.
 */
export function InstalledModules({ organizationId, settings, canUpdate }: InstalledModulesProps) {
  const t = useTranslations("settings.agents.modules");
  const moduleLabel = useModuleLabel();
  const modules = useModuleRegistry().list();
  return (
    <SectionCard title={t("title")} description={t("description")}>
      {modules.length === 0 ? (
        <EmptyState frame="plain" headingLevel={3} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {modules.map(({ manifest }) => {
            const label = moduleLabel(manifest.id);
            return (
              <li
                key={manifest.id}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
              >
                <span className="text-sm font-medium">{label}</span>
                <ModuleEnabledSwitch
                  organizationId={organizationId}
                  module={{ id: manifest.id, label }}
                  settings={settings}
                  canUpdate={canUpdate}
                />
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
