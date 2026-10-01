"use client";

import type { FeatureFlag } from "@core/contracts";
import { createContext, use, useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { useAllAdminOrganizations } from "#/entities/admin-organization/index.ts";
import { useAdminFlags } from "#/entities/feature-flag/index.ts";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { SetFlagDialog, type FlagChange } from "#/features/admin-set-flag/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Switch } from "#/shared/ui/atoms/Switch/Switch.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { StatusPill, type StatusTone } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { AdminOrganizationFilter, AdminPageFrame, AdminQuerySection, useAdminSearch } from "#/widgets/admin-nav/index.ts";

const column = dataTableColumnHelper<FeatureFlag>();
const KIND_TONES: Record<FeatureFlag["kind"], StatusTone> = { "kill-switch": "danger", rollout: "blue", ops: "neutral" };

type Organization = { readonly id: string; readonly name: string };

/** What the row controls need: who may write now, the chosen organization and its flags. */
type RowContext = {
  readonly writable: boolean;
  readonly organization: Organization | undefined;
  /** The chosen organization's view of each flag, by key; `undefined` while it loads or fails. */
  readonly overrides: ReadonlyMap<string, FeatureFlag> | undefined;
  readonly onChange: (change: FlagChange) => void;
};

// Row controls read this from context, not from the column definitions: columns stay the same
// objects while data loads, so a control never remounts under the pointer.
const RowContextValue = createContext<RowContext | null>(null);

const useRowContext = (): RowContext => {
  const context = use(RowContextValue);
  if (context === null) throw new Error("flag row controls must render inside AdminFlagsView");
  return context;
};

function FlagName({ flag }: { flag: FeatureFlag }) {
  const t = useTranslations("admin.flags");
  return (
    <span className="flex max-w-prose min-w-0 flex-col gap-0.5 whitespace-normal">
      <span className="font-mono text-[13px] font-medium">{flag.key}</span>
      <span className="text-[12.5px] text-muted-foreground">{flag.reason}</span>
      <span className="text-[11.5px] text-muted-foreground">{t("owner", { owner: flag.owner })}</span>
    </span>
  );
}

function Expiry({ flag }: { flag: FeatureFlag }) {
  const t = useTranslations("admin.flags");
  const formatDateTime = useFormatDateTime();
  return (
    <span className="flex flex-col items-start gap-1">
      <span>{formatDateTime(flag.expiresAt, "date")}</span>
      {flag.expired ? (
        <StatusPill tone="amber" icon="alert-triangle">
          {t("expired")}
        </StatusPill>
      ) : null}
    </span>
  );
}

function EnvironmentSwitch({ flag }: { flag: FeatureFlag }) {
  const t = useTranslations("admin.flags");
  const context = useRowContext();
  return (
    <span className="inline-flex items-center gap-2">
      <Switch
        checked={flag.value}
        disabled={!context.writable}
        aria-label={t("environmentSwitch", { key: flag.key })}
        onCheckedChange={(value) => context.onChange({ flag, value })}
      />
      <span className="text-[12.5px]">{flag.value ? t("on") : t("off")}</span>
    </span>
  );
}

function OrganizationOverride({ flag }: { flag: FeatureFlag }) {
  const t = useTranslations("admin.flags");
  const context = useRowContext();
  const { organization } = context;
  const seen = context.overrides?.get(flag.key);
  if (organization === undefined) return null;
  if (seen === undefined) return <span className="text-muted-foreground">{t("override.unknown")}</span>;
  const override = seen.tenantOverride;
  const offer = (value: boolean) => (
    <Button
      variant="outline"
      size="sm"
      disabled={!context.writable}
      aria-label={t(value ? "override.setOnNamed" : "override.setOffNamed", { key: flag.key, name: organization.name })}
      onClick={() => context.onChange({ flag, value, organization })}
    >
      {t(value ? "override.setOn" : "override.setOff")}
    </Button>
  );
  return (
    <span className="flex flex-col items-start gap-1.5">
      <StatusPill tone={override === null ? "neutral" : override ? "emerald" : "amber"}>{t(override === null ? "override.none" : override ? "override.on" : "override.off")}</StatusPill>
      <span className="text-[11.5px] text-muted-foreground">{t(seen.value ? "override.effectiveOn" : "override.effectiveOff")}</span>
      <span className="flex flex-wrap gap-1.5">
        {override === true ? null : offer(true)}
        {override === false ? null : offer(false)}
      </span>
    </span>
  );
}

const useColumns = (withOverride: boolean) => {
  const t = useTranslations("admin.flags");
  return useMemo(
    () => [
      column.display({ id: "flag", header: () => t("columns.flag"), cell: ({ row }) => <FlagName flag={row.original} /> }),
      column.accessor("kind", { header: () => t("columns.kind"), cell: ({ getValue }) => <StatusPill tone={KIND_TONES[getValue()]}>{t(`kind.${getValue()}`)}</StatusPill> }),
      column.display({ id: "expiry", header: () => t("columns.expiresAt"), cell: ({ row }) => <Expiry flag={row.original} /> }),
      column.display({ id: "environment", header: () => t("columns.environment"), cell: ({ row }) => <EnvironmentSwitch flag={row.original} /> }),
      ...(withOverride ? [column.display({ id: "override", header: () => t("columns.override"), cell: ({ row }) => <OrganizationOverride flag={row.original} /> })] : []),
    ],
    [withOverride, t],
  );
};

function ExpiredAlert({ flags }: { flags: readonly FeatureFlag[] }) {
  const t = useTranslations("admin.flags");
  const expired = flags.filter((flag) => flag.expired);
  if (expired.length === 0) return null;
  return (
    <Alert variant="warning">
      <Icon name="alert-triangle" />
      <AlertTitle>{t("expiredAlertTitle", { count: expired.length })}</AlertTitle>
      <AlertDescription>{t("expiredAlertDescription", { keys: expired.map((flag) => flag.key).join(", ") })}</AlertDescription>
    </Alert>
  );
}

function FlagsTable({ flags, withOverride, onReload }: { flags: readonly FeatureFlag[]; withOverride: boolean; onReload: () => void }) {
  const t = useTranslations("admin.flags");
  const columns = useColumns(withOverride);
  return (
    <DataTable
      caption={t("caption")}
      captionHidden
      columns={columns}
      data={flags}
      getRowId={(flag) => flag.key}
      stateHeadingLevel={2}
      renderCard={(flag) => (
        <div className="flex flex-col gap-2">
          <FlagName flag={flag} />
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill tone={KIND_TONES[flag.kind]}>{t(`kind.${flag.kind}`)}</StatusPill>
            <span className="text-xs text-muted-foreground">{t("columns.expiresAt")}</span>
            <Expiry flag={flag} />
          </span>
          <EnvironmentSwitch flag={flag} />
          <OrganizationOverride flag={flag} />
        </div>
      )}
      empty={
        <EmptyState
          frame="plain"
          headingLevel={2}
          icon="flag"
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button variant="secondary" onClick={onReload}>
              {t("reload")}
            </Button>
          }
        />
      }
    />
  );
}

function FlagsContent({ flags, onReload }: { flags: readonly FeatureFlag[]; onReload: () => void }) {
  const t = useTranslations("admin.flags");
  const online = useOnlineStatus();
  const search = useAdminSearch(["organizationId"]);
  const organizationId = search.values.organizationId;
  const organizations = useAllAdminOrganizations();
  const overrides = useAdminFlags(organizationId, { enabled: organizationId !== undefined });
  const [change, setChange] = useState<FlagChange | null>(null);
  const context = useMemo((): RowContext => {
    const name = organizations.data?.find((candidate) => candidate.id === organizationId)?.name ?? organizationId ?? "";
    return {
      writable: online,
      organization: organizationId === undefined ? undefined : { id: organizationId, name },
      overrides: organizationId === undefined || overrides.data === undefined ? undefined : new Map(overrides.data.map((flag) => [flag.key, flag])),
      onChange: setChange,
    };
  }, [online, organizationId, organizations.data, overrides.data]);
  return (
    <div className="flex flex-col gap-4">
      <ExpiredAlert flags={flags} />
      <div className="flex flex-col gap-1.5 sm:max-w-sm">
        <AdminOrganizationFilter value={organizationId} onValueChange={(next) => search.set({ organizationId: next })} label={t("organizationLabel")} />
        <p className="text-xs text-muted-foreground">{organizationId === undefined ? t("organizationHint") : t("overrideHint")}</p>
      </div>
      {organizationId !== undefined && overrides.isError ? (
        <Alert variant="destructive">
          <Icon name="alert-triangle" />
          <AlertTitle>{t("overridesErrorTitle")}</AlertTitle>
          <AlertDescription>
            <Button variant="outline" size="sm" onClick={() => void overrides.refetch()} pending={overrides.isFetching}>
              {t("reload")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <RowContextValue value={context}>
        <FlagsTable flags={flags} withOverride={organizationId !== undefined} onReload={onReload} />
      </RowContextValue>
      <SetFlagDialog change={change} onOpenChange={(open) => !open && setChange(null)} />
    </div>
  );
}

/**
 * `/admin/flags` (SP5 spec §5–§6, platform.flag.manage): every flag of the code registry with its
 * owner, reason, kind and expiry, a warning for expired flags, the environment value behind a
 * confirmation and, for the organization in the URL, its override. Writes wait for the connection.
 */
export function AdminFlagsView() {
  const t = useTranslations("admin.flags");
  const permissions = usePlatformPermissions();
  const flags = useAdminFlags(undefined, { enabled: permissions.can("platform.flag.manage") });
  return (
    <AdminPageFrame permission="platform.flag.manage" title={t("title")} description={t("description")}>
      <AdminQuerySection query={flags} loadingLabel={t("loading")}>
        {(data) => <FlagsContent flags={data} onReload={() => void flags.refetch()} />}
      </AdminQuerySection>
    </AdminPageFrame>
  );
}
