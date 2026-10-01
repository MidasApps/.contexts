"use client";

import type { Connector } from "@core/contracts";
import { useMemo } from "react";
import { useTranslations } from "use-intl";
import { ADMIN_CONNECTORS_PAGE_LIMIT, useAdminConnectors } from "#/entities/connector/index.ts";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useCursorPages } from "#/shared/lib/pagination/use-cursor-pages.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { StatusPill, type StatusTone } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { AdminOrganizationFilter, AdminPageFrame, AdminQuerySection, useAdminSearch } from "#/widgets/admin-nav/index.ts";

const column = dataTableColumnHelper<Connector>();
const STATUS_TONES: Record<Connector["status"], StatusTone> = { active: "emerald", disabled: "neutral", error: "danger" };

function ConnectorName({ connector }: { connector: Connector }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-medium">{connector.name}</span>
      <span className="font-mono text-[11.5px] text-muted-foreground">{connector.id}</span>
    </span>
  );
}

function ConnectorStatus({ status }: { status: Connector["status"] }) {
  const t = useTranslations("admin.connectors.status");
  return <StatusPill tone={STATUS_TONES[status]}>{t(status)}</StatusPill>;
}

/** Where the connector reaches: its allowed hosts, or the relations a Postgres connector may read. */
function Reach({ connector }: { connector: Connector }) {
  const t = useTranslations("admin.connectors");
  const items = connector.type === "postgres" ? connector.config.allowedRelations : connector.config.allowedHosts;
  const [first, ...others] = items;
  return (
    <span className="flex flex-col">
      <span className="font-mono text-[12.5px] break-all">{first}</span>
      {others.length === 0 ? null : <span className="text-[11.5px] text-muted-foreground">{t("moreReach", { count: others.length })}</span>}
    </span>
  );
}

function Tools({ connector }: { connector: Connector }) {
  const t = useTranslations("admin.connectors");
  return t("tools", { allowed: connector.toolPolicy.allow.length, readOnly: connector.toolPolicy.readOnly.length });
}

/** Whether a secret is stored; the reference and the secret never reach the page. */
function Secret({ connector }: { connector: Connector }) {
  const t = useTranslations("admin.connectors");
  return connector.secretRef === null ? <span className="text-muted-foreground">{t("noSecret")}</span> : t("hasSecret");
}

function When({ iso }: { iso: string }) {
  return useFormatDateTime()(iso);
}

const useColumns = () => {
  const t = useTranslations("admin.connectors");
  return useMemo(
    () => [
      column.display({ id: "name", header: () => t("columns.name"), cell: ({ row }) => <ConnectorName connector={row.original} /> }),
      column.accessor("type", { header: () => t("columns.type"), cell: ({ getValue }) => t(`types.${getValue()}`) }),
      column.accessor("status", { header: () => t("columns.status"), cell: ({ getValue }) => <ConnectorStatus status={getValue()} /> }),
      column.display({ id: "reach", header: () => t("columns.reach"), cell: ({ row }) => <Reach connector={row.original} /> }),
      column.display({ id: "tools", header: () => t("columns.tools"), cell: ({ row }) => <Tools connector={row.original} /> }),
      column.display({ id: "secret", header: () => t("columns.secret"), cell: ({ row }) => <Secret connector={row.original} /> }),
      column.accessor("updatedAt", { header: () => t("columns.updatedAt"), cell: ({ getValue }) => <When iso={getValue()} /> }),
    ],
    [t],
  );
};

function ConnectorsTable({ organizationId }: { organizationId: string }) {
  const t = useTranslations("admin.connectors");
  const connectors = useAdminConnectors(organizationId);
  const paged = useCursorPages(connectors, ADMIN_CONNECTORS_PAGE_LIMIT, t("pagination"));
  const columns = useColumns();
  return (
    <AdminQuerySection query={connectors} loadingLabel={t("loading")}>
      {() => (
        <DataTable
          caption={t("caption")}
          captionHidden
          columns={columns}
          data={paged.rows}
          getRowId={(connector) => connector.id}
          pagination={paged.pagination}
          stateHeadingLevel={2}
          renderCard={(connector) => (
            <div className="flex flex-col gap-2">
              <span className="flex items-start justify-between gap-2">
                <ConnectorName connector={connector} />
                <ConnectorStatus status={connector.status} />
              </span>
              <span className="text-[13px]">{t(`types.${connector.type}`)}</span>
              <Reach connector={connector} />
              <span className="text-xs text-muted-foreground">
                <Tools connector={connector} /> · <Secret connector={connector} />
              </span>
            </div>
          )}
          empty={
            <EmptyState
              frame="plain"
              headingLevel={2}
              icon="plug"
              title={t("emptyTitle")}
              description={t("emptyDescription")}
              action={
                <Button variant="secondary" asChild>
                  <RouteLink to={{ id: "admin", rest: `organizations/${organizationId}` }}>{t("emptyAction")}</RouteLink>
                </Button>
              }
            />
          }
        />
      )}
    </AdminQuerySection>
  );
}

/**
 * `/admin/connectors` (SP5 spec §6, platform.connector.read): the connectors of one organization
 * — type, status, where they reach, how many tools agents may call and whether a secret is stored
 * (never the secret or its reference). Read only: staff hold no permission that changes a
 * connector, so the organization's own administrators disable or edit it in their settings.
 */
export function AdminConnectorsView() {
  const t = useTranslations("admin.connectors");
  const permissions = usePlatformPermissions();
  const search = useAdminSearch(["organizationId"]);
  const organizationId = search.values.organizationId;
  return (
    <AdminPageFrame permission="platform.connector.read" title={t("title")} description={t("description")}>
      {permissions.can("platform.connector.read") ? (
        <div className="flex flex-col gap-4">
          <div role="search" aria-label={t("filtersLabel")} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <AdminOrganizationFilter required value={organizationId} onValueChange={(next) => search.set({ organizationId: next })} />
          </div>
          <Alert>
            <AlertDescription>{t("readOnlyNotice")}</AlertDescription>
          </Alert>
          {organizationId === undefined ? (
            <EmptyState
              headingLevel={2}
              icon="building"
              title={t("chooseTitle")}
              description={t("chooseDescription")}
              action={
                <Button variant="secondary" asChild>
                  <RouteLink to={{ id: "admin", rest: "organizations" }}>{t("chooseAction")}</RouteLink>
                </Button>
              }
            />
          ) : (
            <ConnectorsTable key={organizationId} organizationId={organizationId} />
          )}
        </div>
      ) : null}
    </AdminPageFrame>
  );
}
