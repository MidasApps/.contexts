"use client";

import type { AccessContext, FeatureFlag } from "@core/contracts";
import { useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { useTenantFlags } from "#/entities/feature-flag/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { TenantClearFlagOverrideDialog, TenantSetFlagDialog, type TenantFlagChange } from "#/features/tenant-set-flag/index.ts";
import { useFlagLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage, QuerySection } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";

const column = dataTableColumnHelper<FeatureFlag>();

/** The flag's localized name and description; the key stays as secondary text, for support. */
function FlagName({ flag }: { flag: FeatureFlag }) {
  const label = useFlagLabel();
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-medium">{label.name(flag.key)}</span>
      <span className="text-body text-muted-foreground">{label.description(flag.key, flag.reason)}</span>
      <span className="font-mono text-caption text-muted-foreground">{flag.key}</span>
    </span>
  );
}

function OnOff({ value }: { value: boolean }) {
  const t = useTranslations("settings.flags.value");
  return <StatusPill tone={value ? "emerald" : "neutral"}>{t(value ? "on" : "off")}</StatusPill>;
}

/**
 * The platform's own value. The API returns the effective value and the override only, so the
 * platform value is known just while the organization has no override.
 */
function PlatformValue({ flag }: { flag: FeatureFlag }) {
  const t = useTranslations("settings.flags");
  return flag.tenantOverride === null ? <OnOff value={flag.value} /> : <span className="text-body text-muted-foreground">{t("platformUnknown")}</span>;
}

function Override({ flag }: { flag: FeatureFlag }) {
  const t = useTranslations("settings.flags.override");
  return flag.tenantOverride === null ? <span className="text-muted-foreground">{t("none")}</span> : t(flag.tenantOverride ? "on" : "off");
}

/** Off for the organization → offer to use it again; otherwise, when it is on, offer to switch it off. */
const changeOf = (flag: FeatureFlag): TenantFlagChange | null => {
  if (flag.tenantOverride === false) return { flag, value: true };
  return flag.value ? { flag, value: false } : null;
};

/** What a writer may do on a row: change the override, or remove it (decision 0066). */
type FlagHandlers = { readonly onChange: (change: TenantFlagChange) => void; readonly onClear: (flag: FeatureFlag) => void };

function FlagAction({ flag, handlers }: { flag: FeatureFlag; handlers: FlagHandlers }) {
  const t = useTranslations("settings.flags.actions");
  const change = changeOf(flag);
  const name = useFlagLabel().name(flag.key);
  const follow =
    flag.tenantOverride === null ? null : (
      <Button variant="ghost" size="sm" onClick={() => handlers.onClear(flag)} aria-label={t("followNamed", { key: name })}>
        {t("follow")}
      </Button>
    );
  if (change === null) return follow ?? <span className="text-body text-muted-foreground">{t("platformOff")}</span>;
  return (
    <span className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => handlers.onChange(change)} aria-label={t(change.value ? "turnOnNamed" : "turnOffNamed", { key: name })}>
        {t(change.value ? "turnOn" : "turnOff")}
      </Button>
      {follow}
    </span>
  );
}

const useColumns = (handlers: FlagHandlers | null) => {
  const t = useTranslations("settings.flags");
  return useMemo(
    () => [
      column.display({ id: "flag", header: () => t("columns.flag"), cell: ({ row }) => <FlagName flag={row.original} /> }),
      column.display({ id: "platform", header: () => t("columns.platform"), cell: ({ row }) => <PlatformValue flag={row.original} /> }),
      column.display({ id: "override", header: () => t("columns.override"), cell: ({ row }) => <Override flag={row.original} /> }),
      column.accessor("value", { header: () => t("columns.effective"), cell: ({ getValue }) => <OnOff value={getValue()} /> }),
      column.display({
        id: "actions",
        header: () => t("columns.actions"),
        meta: { headerHidden: true },
        cell: ({ row }) => (handlers === null ? null : <FlagAction flag={row.original} handlers={handlers} />),
      }),
    ],
    [handlers, t],
  );
};

function FlagsTable({ flags, organizationName, handlers }: { flags: readonly FeatureFlag[]; organizationName: string; handlers: FlagHandlers | null }) {
  const t = useTranslations("settings.flags");
  const columns = useColumns(handlers);
  return (
    <DataTable
      caption={t("caption", { organization: organizationName })}
      captionHidden
      columns={columns}
      data={flags}
      getRowId={(flag) => flag.key}
      stateHeadingLevel={2}
      renderCard={(flag) => (
        <div className="flex flex-col gap-2">
          <span className="flex items-start justify-between gap-2">
            <FlagName flag={flag} />
            <OnOff value={flag.value} />
          </span>
          <span className="text-xs text-muted-foreground">
            {t("columns.override")}: <Override flag={flag} />
          </span>
          {handlers === null ? null : <FlagAction flag={flag} handlers={handlers} />}
        </div>
      )}
      empty={<EmptyState frame="plain" headingLevel={2} icon="flag" title={t("emptyTitle")} description={t("emptyDescription")} />}
    />
  );
}

function SettingsFlags({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.flags");
  const online = useOnlineStatus();
  const { organization } = context;
  const allowed = context.permissions.includes("core.flag.read");
  const canWrite = context.permissions.includes("core.flag.write");
  const flags = useTenantFlags(organization.id, { enabled: allowed });
  const [change, setChange] = useState<TenantFlagChange | null>(null);
  const [clearing, setClearing] = useState<FeatureFlag | null>(null);
  const handlers = useMemo<FlagHandlers>(() => ({ onChange: setChange, onClear: setClearing }), []);
  return (
    <SettingsPageFrame width="wide"
      organizationId={organization.id}
      allowed={allowed}
      header={<PageHeader eyebrow={t("eyebrow", { organization: organization.name })} title={t("title")} description={t("description")} />}
    >
      <div className="flex flex-col gap-4">
        {online ? null : <OfflineNotice />}
        <Alert>
          <AlertDescription>{t("onlyOffNotice")}</AlertDescription>
        </Alert>
        <QuerySection query={flags} loadingLabel={t("loading")}>
          {(data) => <FlagsTable flags={data} organizationName={organization.name} handlers={canWrite && online ? handlers : null} />}
        </QuerySection>
      </div>
      {canWrite ? <TenantSetFlagDialog organizationId={organization.id} change={change} onOpenChange={(open) => !open && setChange(null)} /> : null}
      {canWrite ? <TenantClearFlagOverrideDialog organizationId={organization.id} flag={clearing} onOpenChange={(open) => !open && setClearing(null)} /> : null}
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/flags` (SP5 spec §5, §7; core.flag.read): the flags an
 * organization may override, with the platform value, its own override and what it gets. An
 * organization can only switch a feature off for itself, use it again, or remove its own change
 * and follow the platform (core.flag.write, decision 0066); it can never enable what the platform
 * disables.
 */
export function SettingsFlagsView() {
  const t = useTranslations("settings.flags");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsFlags context={data} />}
    </QueryPage>
  );
}
