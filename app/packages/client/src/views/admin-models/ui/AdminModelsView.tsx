"use client";

import type { ModelSettings } from "@core/contracts";
import { useTranslations } from "use-intl";
import { useModelSettings } from "#/entities/model-settings/index.ts";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { ModelSettingsEditor } from "#/features/admin-update-models/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { AdminPageFrame, AdminQuerySection } from "#/widgets/admin-nav/index.ts";

function ModelsContent({ settings }: { settings: ModelSettings }) {
  const t = useTranslations("admin.models");
  return (
    <div className="flex flex-col gap-6">
      {settings.aiMode === "fake" ? (
        <Alert variant="info" role={undefined}>
          <Icon name="info" />
          <AlertDescription className="text-inherit">{t("fakeMode")}</AlertDescription>
        </Alert>
      ) : null}
      <ModelSettingsEditor settings={settings} />
    </div>
  );
}

/**
 * `/admin/models` (decision 0072, platform.model.manage): the model each runtime role runs on and
 * the price of each model, saved together. Roles the environment fixes are shown read only.
 */
export function AdminModelsView() {
  const t = useTranslations("admin.models");
  const formatDateTime = useFormatDateTime();
  const permissions = usePlatformPermissions();
  const settings = useModelSettings({ enabled: permissions.can("platform.model.manage") });
  const updatedAt = settings.data?.updatedAt ?? null;
  return (
    <AdminPageFrame
      permission="platform.model.manage"
      title={t("title")}
      description={t("description")}
      meta={
        updatedAt === null ? undefined : (
          <span className="text-xs text-muted-foreground">{t("updatedAt", { date: formatDateTime(updatedAt) })}</span>
        )
      }
    >
      <AdminQuerySection query={settings} loadingLabel={t("loading")}>
        {(data) => <ModelsContent settings={data} />}
      </AdminQuerySection>
    </AdminPageFrame>
  );
}
