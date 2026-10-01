"use client";

import { useCan } from "@core/client/entities/permission";
import { useModuleSettings } from "@core/client/entities/module-settings";
import { useFormatDateTime, useFormatMoney } from "@core/client/shared/lib/format";
import { RouteLink } from "@core/client/shared/lib/router";
import { Button } from "@core/client/shared/ui/atoms/Button/Button";
import { EmptyState } from "@core/client/shared/ui/molecules/EmptyState/EmptyState";
import { SectionCard } from "@core/client/shared/ui/molecules/SectionCard/SectionCard";
import { QuerySection } from "@core/client/widgets/page-state";
import type { AccessContext } from "@core/contracts";
import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { ExampleSettingsSchema, type ExampleSettings } from "../contracts/example-settings.schema.ts";

function Term({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

/** What the server resolved for the URL node (SP1 §10): nodes, regional settings and "now" in the display zone. */
export function ExampleContextCard({ context, now }: { context: AccessContext; now: () => Date }) {
  const t = useTranslations("example.home");
  const formatDateTime = useFormatDateTime();
  return (
    <SectionCard title={t("contextTitle")} description={t("contextDescription")}>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Term label={t("organization")}>{context.organization.name}</Term>
        <Term label={t("project")}>{context.project?.name ?? "—"}</Term>
        <Term label={t("unit")}>{context.unit?.name ?? t("noUnit")}</Term>
        <Term label={t("locale")}>{context.regional.locale}</Term>
        <Term label={t("timeZone")}>{context.regional.displayTimeZone}</Term>
        <Term label={t("currency")}>{context.regional.currency}</Term>
        <Term label={t("now")}>
          <time dateTime={now().toISOString()}>{formatDateTime(now().toISOString())}</time>
        </Term>
      </dl>
    </SectionCard>
  );
}

function NotConfigured({ organizationId, moduleId }: { organizationId: string; moduleId: string }) {
  const t = useTranslations("example.home");
  const canConfigure = useCan("example.item.write");
  return (
    <EmptyState
      icon="settings"
      title={t("emptyTitle")}
      description={canConfigure ? t("emptyDescription") : t("emptyDescriptionReadOnly")}
      action={
        canConfigure ? (
          <Button asChild variant="outline">
            <RouteLink to={{ id: "settings-module", organizationId, moduleId }}>{t("configure")}</RouteLink>
          </Button>
        ) : undefined
      }
    />
  );
}

function ConfiguredSettings({ settings }: { settings: ExampleSettings }) {
  const t = useTranslations("example.home");
  const formatMoney = useFormatMoney();
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <Term label={t("greeting")}>{settings.greeting}</Term>
      <Term label={t("defaultBudget")}>
        <span className="tabular-nums">{formatMoney(settings.defaultBudget)}</span>
      </Term>
    </dl>
  );
}

/**
 * The organization's module settings (`GET …/module-settings/example`): skeleton, error with retry,
 * no-access on 403, an empty state until first saved (values that no longer parse count as unset).
 */
export function ExampleSettingsCard({ organizationId, moduleId }: { organizationId: string; moduleId: string }) {
  const t = useTranslations("example.home");
  const query = useModuleSettings(organizationId, moduleId);
  return (
    <SectionCard title={t("settingsTitle")}>
      <QuerySection query={query} loadingLabel={t("settingsLoading")}>
        {(stored) => {
          const parsed = ExampleSettingsSchema.safeParse(stored.values);
          return parsed.success ? <ConfiguredSettings settings={parsed.data} /> : <NotConfigured organizationId={organizationId} moduleId={moduleId} />;
        }}
      </QuerySection>
    </SectionCard>
  );
}
