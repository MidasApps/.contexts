"use client";

import type { AccessContext, Organization } from "@core/contracts";
import { useState } from "react";
import { useLocale, useTranslations } from "use-intl";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { DeleteOrganizationDialog } from "#/features/delete-organization/index.ts";
import { UpdateOrganizationForm } from "#/features/update-organization/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { currencyLabel } from "#/shared/ui/molecules/CurrencySelect/CurrencySelect.tsx";
import { endonym } from "#/shared/ui/molecules/LocaleSelect/LocaleSelect.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { timeZoneLabel } from "#/shared/ui/molecules/TimeZoneSelect/TimeZoneSelect.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";

/** Read-only details for members without `core.organization.update`. */
function OrganizationDetails({ organization }: { organization: Organization }) {
  const t = useTranslations("settings.general");
  const locale = useLocale();
  const rows: [string, string][] = [
    [t("form.name"), organization.name],
    [t("form.locale"), endonym(organization.defaults.locale)],
    [t("form.timeZone"), timeZoneLabel(organization.defaults.timeZone, locale, new Date())],
    [t("form.currency"), currencyLabel(organization.defaults.currency, locale)],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[180px_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Owners only (core.organization.delete): the way out, apart from the everyday settings. */
function DeleteOrganizationSection({ organization }: { organization: Organization }) {
  const t = useTranslations("settings.general.delete");
  const [open, setOpen] = useState(false);
  return (
    <SectionCard tone="danger" title={t("sectionTitle")} description={t("sectionDescription")}>
      <Button variant="destructive" className="self-start" onClick={() => setOpen(true)}>
        {t("action")}
      </Button>
      <DeleteOrganizationDialog organization={organization} open={open} onOpenChange={setOpen} />
    </SectionCard>
  );
}

function SettingsGeneral({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.general");
  const formatDateTime = useFormatDateTime();
  const { organization } = context;
  const canUpdate = context.permissions.includes("core.organization.update");
  return (
    <SettingsPageFrame
      organizationId={organization.id}
      allowed={context.permissions.includes("core.organization.read")}
      header={
        <PageHeader
          eyebrow={t("eyebrow", { organization: organization.name })}
          title={t("title")}
          description={t("description")}
          meta={
            organization.status === "suspended" ? <StatusPill tone="amber">{t("suspended")}</StatusPill> : undefined
          }
        />
      }
    >
      <div className="flex flex-col gap-6">
        <SectionCard
          title={t("detailsTitle")}
          description={canUpdate ? t("detailsDescription") : t("readOnlyDescription")}
        >
          {canUpdate ? (
            <UpdateOrganizationForm organization={organization} />
          ) : (
            <OrganizationDetails organization={organization} />
          )}
        </SectionCard>
        {context.permissions.includes("core.organization.delete") ? (
          <DeleteOrganizationSection organization={organization} />
        ) : null}
        <p className="text-xs text-muted-foreground">
          {t("createdAt", { date: formatDateTime(organization.createdAt, "date") })}
        </p>
      </div>
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/general` (SP2 spec §8): name and regional defaults (locale, time
 * zone, currency) — editable with core.organization.update, read-only otherwise — and, for
 * core.organization.delete, deleting the organization.
 */
export function SettingsGeneralView() {
  const t = useTranslations("settings.general");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsGeneral context={data} />}
    </QueryPage>
  );
}
