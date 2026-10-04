"use client";

import type { AccessContext, ModuleSettingsManifest } from "@core/contracts";
import { useTranslations } from "use-intl";
import { useModuleSettings } from "#/entities/module-settings/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { ModuleSettingsForm } from "#/features/update-module-settings/index.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { useModuleRegistry } from "#/shared/lib/shell/shell-registry-context.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { PageNotFound, QueryPage, QuerySection } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";

type ModuleRef = { id: string; labelKey: string; settings: ModuleSettingsManifest };

function ModuleSettingsContent({ context, module }: { context: AccessContext; module: ModuleRef }) {
  const t = useTranslations("settings.module");
  const settings = useModuleSettings(context.organization.id, module.id);
  return (
    <QuerySection query={settings} loadingLabel={t("loading")}>
      {(data) => (
        <SectionCard title={t("formTitle")} description={data.updatedAt === null ? t("neverSaved") : undefined}>
          <ModuleSettingsForm
            organizationId={context.organization.id}
            moduleId={module.id}
            contract={module.settings.contract}
            settings={data}
            canUpdate={context.permissions.includes(module.settings.updatePermission)}
            context={context}
          />
        </SectionCard>
      )}
    </QuerySection>
  );
}

function SettingsModule({ context, module }: { context: AccessContext; module: ModuleRef }) {
  const t = useTranslations();
  const name = t.has(module.labelKey) ? t(module.labelKey) : module.id;
  return (
    <SettingsPageFrame
      organizationId={context.organization.id}
      allowed={context.permissions.includes(module.settings.readPermission)}
      header={
        <PageHeader
          eyebrow={t("settings.module.eyebrow", { organization: context.organization.name })}
          title={name}
          description={t("settings.module.description", { module: name })}
        />
      }
    >
      <ModuleSettingsContent context={context} module={module} />
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/m/:moduleId` (SP2 spec §6, §8): an installed module's settings
 * rendered from its contract. Unknown modules and modules without settings render not-found; the
 * manifest's read permission gates the page and its update permission the form.
 */
export function SettingsModuleView() {
  const t = useTranslations("settings.module");
  const node = useCurrentNode();
  const moduleId = useRouter().useRouteParams()["moduleId"];
  const manifest = useModuleRegistry().get(moduleId ?? "")?.manifest;
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  if (manifest?.settings === undefined) return <PageNotFound />;
  const module: ModuleRef = { id: manifest.id, labelKey: manifest.labelKey, settings: manifest.settings };
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsModule context={data} module={module} />}
    </QueryPage>
  );
}
