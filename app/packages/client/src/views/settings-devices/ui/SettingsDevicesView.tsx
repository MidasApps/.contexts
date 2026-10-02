"use client";

import type { AccessContext, Device } from "@core/contracts";
import { useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { DEVICES_PAGE_LIMIT, useDevices } from "#/entities/device/index.ts";
import { useRoles } from "#/entities/role/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { CreateDeviceActivationDialog } from "#/features/create-device-activation/index.ts";
import { RevokeDeviceDialog } from "#/features/revoke-device/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { useCursorPages } from "#/shared/lib/pagination/use-cursor-pages.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableStatusOf } from "#/shared/ui/organisms/DataTable/data-table-status.ts";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { NodeName } from "#/widgets/access-node/index.ts";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";

const column = dataTableColumnHelper<Device>();

function DeviceStatus({ device }: { device: Device }) {
  const t = useTranslations("settings.devices.status");
  return <StatusPill tone={device.status === "active" ? "emerald" : "neutral"}>{t(device.status)}</StatusPill>;
}

const useColumns = (onRevoke: ((device: Device) => void) | null) => {
  const t = useTranslations("settings.devices");
  const formatDateTime = useFormatDateTime();
  return useMemo(
    () => [
      column.accessor("label", { header: () => t("columns.label"), cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> }),
      column.display({ id: "node", header: () => t("columns.node"), cell: ({ row }) => <NodeName node={row.original.node} /> }),
      column.accessor("lastSeenAt", { header: () => t("columns.lastSeen"), cell: ({ getValue }) => (getValue() === null ? t("neverSeen") : formatDateTime(getValue() ?? "")) }),
      column.accessor("createdAt", { header: () => t("columns.activated"), cell: ({ getValue }) => formatDateTime(getValue(), "date") }),
      column.accessor("status", { header: () => t("columns.status"), cell: ({ row }) => <DeviceStatus device={row.original} /> }),
      column.display({
        id: "actions",
        header: () => t("columns.actions"),
        meta: { headerHidden: true },
        cell: ({ row }) =>
          onRevoke === null || row.original.status !== "active" ? null : (
            <Button variant="outline" size="sm" onClick={() => onRevoke(row.original)} aria-label={t("revokeNamed", { name: row.original.label })}>
              {t("revokeAction")}
            </Button>
          ),
      }),
    ],
    [formatDateTime, onRevoke, t],
  );
};

function DevicesTable({ context, onCreate }: { context: AccessContext; onCreate: (() => void) | null }) {
  const t = useTranslations("settings.devices");
  const formatDateTime = useFormatDateTime();
  const { organization } = context;
  const devices = useDevices(organization.id);
  const [revoking, setRevoking] = useState<Device | null>(null);
  const canRevoke = context.permissions.includes("core.device.revoke");
  const columns = useColumns(canRevoke ? setRevoking : null);
  const paged = useCursorPages(devices, DEVICES_PAGE_LIMIT, t("pagination"));
  return (
    <>
      <DataTable
        caption={t("caption", { organization: organization.name })}
        captionHidden
        columns={columns}
        data={paged.rows}
        getRowId={(device) => device.id}
        status={dataTableStatusOf(devices)}
        pagination={paged.pagination}
        stateHeadingLevel={2}
        renderCard={(device) => (
          <div className="flex flex-col gap-2">
            <span className="flex items-center justify-between gap-2">
              <span className="font-medium">{device.label}</span>
              <DeviceStatus device={device} />
            </span>
            <span className="text-[13px]">
              <NodeName node={device.node} />
            </span>
            <span className="text-xs text-muted-foreground">{device.lastSeenAt === null ? t("neverSeen") : t("lastSeenOn", { date: formatDateTime(device.lastSeenAt) })}</span>
            {canRevoke && device.status === "active" ? (
              <Button variant="outline" size="sm" className="self-start" onClick={() => setRevoking(device)} aria-label={t("revokeNamed", { name: device.label })}>
                {t("revokeAction")}
              </Button>
            ) : null}
          </div>
        )}
        empty={
          <EmptyState
            frame="plain"
            headingLevel={2}
            icon="smartphone"
            title={t("emptyTitle")}
            description={onCreate === null ? t("emptyDescriptionNoPermission") : t("emptyDescription")}
            action={onCreate === null ? undefined : <Button onClick={onCreate}>{t("create")}</Button>}
          />
        }
      />
      <RevokeDeviceDialog organizationId={organization.id} device={revoking} onOpenChange={(open) => !open && setRevoking(null)} />
    </>
  );
}

function SettingsDevices({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.devices");
  const online = useOnlineStatus();
  const { organization } = context;
  const [creating, setCreating] = useState(false);
  const canCreate = context.permissions.includes("core.device.create");
  const roles = useRoles(canCreate ? organization.id : undefined);
  return (
    <SettingsPageFrame
      organizationId={organization.id}
      allowed={context.permissions.includes("core.device.read")}
      header={
        <PageHeader
          eyebrow={t("eyebrow", { organization: organization.name })}
          title={t("title")}
          description={t("description")}
          actions={
            canCreate ? (
              <Button onClick={() => setCreating(true)} disabled={!online}>
                <Icon name="plus" />
                {t("create")}
              </Button>
            ) : undefined
          }
        />
      }
    >
      <DevicesTable context={context} onCreate={canCreate && online ? () => setCreating(true) : null} />
      {canCreate ? <CreateDeviceActivationDialog organization={organization} customRoles={roles.data} open={creating} onOpenChange={setCreating} /> : null}
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/devices` (SP2 spec §8, core.device.read): activated devices with
 * node, last activity and status; create a one-time activation code and revoke devices.
 */
export function SettingsDevicesView() {
  const t = useTranslations("settings.devices");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsDevices context={data} />}
    </QueryPage>
  );
}
