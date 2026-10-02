"use client";

import type { AccessContext, Connector } from "@core/contracts";
import { useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { TENANT_CONNECTORS_PAGE_LIMIT, useTenantConnectors } from "#/entities/connector/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { ConnectorEditorDialog, ConnectorSecretDialog, DeleteConnectorDialog, ToggleConnectorDialog } from "#/features/connector-editor/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { useCursorPages } from "#/shared/lib/pagination/use-cursor-pages.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import { StatusPill, type StatusTone } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableStatusOf } from "#/shared/ui/organisms/DataTable/data-table-status.ts";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";

const column = dataTableColumnHelper<Connector>();
const STATUS_TONES: Record<Connector["status"], StatusTone> = { active: "emerald", disabled: "neutral", error: "danger" };

/** What a row action opens; `null` handlers mean the viewer cannot write (or is offline). */
type RowActions = { edit: (connector: Connector) => void; secret: (connector: Connector) => void; toggle: (connector: Connector) => void; remove: (connector: Connector) => void };

function ConnectorName({ connector }: { connector: Connector }) {
  const t = useTranslations("settings.connectors");
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-medium">{connector.name}</span>
      <span className="text-[11.5px] text-muted-foreground">{t(`types.${connector.type}`)}</span>
    </span>
  );
}

function ConnectorStatus({ status }: { status: Connector["status"] }) {
  const t = useTranslations("settings.connectors.status");
  return <StatusPill tone={STATUS_TONES[status]}>{t(status)}</StatusPill>;
}

/** Only whether a secret is stored: the reference and the secret never reach the page. */
function SecretState({ connector }: { connector: Connector }) {
  const t = useTranslations("settings.connectors");
  return connector.secretRef === null ? <span className="text-muted-foreground">{t("noSecret")}</span> : t("hasSecret");
}

function Tools({ connector }: { connector: Connector }) {
  const t = useTranslations("settings.connectors");
  return t("tools", { allowed: connector.toolPolicy.allow.length, readOnly: connector.toolPolicy.readOnly.length });
}

function Actions({ connector, actions }: { connector: Connector; actions: RowActions }) {
  const t = useTranslations("settings.connectors.actions");
  const { name } = connector;
  return (
    <span className="flex flex-wrap gap-1.5">
      <Button variant="outline" size="sm" onClick={() => actions.edit(connector)} aria-label={t("editNamed", { name })}>
        {t("edit")}
      </Button>
      <Button variant="outline" size="sm" onClick={() => actions.secret(connector)} aria-label={t(connector.secretRef === null ? "setSecretNamed" : "replaceSecretNamed", { name })}>
        {t(connector.secretRef === null ? "setSecret" : "replaceSecret")}
      </Button>
      <Button variant="outline" size="sm" onClick={() => actions.toggle(connector)} aria-label={t(connector.status === "active" ? "disableNamed" : "enableNamed", { name })}>
        {t(connector.status === "active" ? "disable" : "enable")}
      </Button>
      <Button variant="outline" size="sm" onClick={() => actions.remove(connector)} aria-label={t("deleteNamed", { name })}>
        {t("delete")}
      </Button>
    </span>
  );
}

const useColumns = (actions: RowActions | null) => {
  const t = useTranslations("settings.connectors");
  const formatDateTime = useFormatDateTime();
  return useMemo(
    () => [
      column.display({ id: "name", header: () => t("columns.name"), cell: ({ row }) => <ConnectorName connector={row.original} /> }),
      column.accessor("status", { header: () => t("columns.status"), cell: ({ getValue }) => <ConnectorStatus status={getValue()} /> }),
      column.display({ id: "secret", header: () => t("columns.secret"), cell: ({ row }) => <SecretState connector={row.original} /> }),
      column.display({ id: "tools", header: () => t("columns.tools"), cell: ({ row }) => <Tools connector={row.original} /> }),
      column.accessor("updatedAt", { header: () => t("columns.updatedAt"), cell: ({ getValue }) => formatDateTime(getValue()) }),
      column.display({
        id: "actions",
        header: () => t("columns.actions"),
        meta: { headerHidden: true },
        cell: ({ row }) => (actions === null ? null : <Actions connector={row.original} actions={actions} />),
      }),
    ],
    [actions, formatDateTime, t],
  );
};

function ConnectorsTable({ context, actions, onCreate }: { context: AccessContext; actions: RowActions | null; onCreate: (() => void) | null }) {
  const t = useTranslations("settings.connectors");
  const { organization } = context;
  const connectors = useTenantConnectors(organization.id);
  const paged = useCursorPages(connectors, TENANT_CONNECTORS_PAGE_LIMIT, t("pagination"));
  const columns = useColumns(actions);
  return (
    <DataTable
      caption={t("caption", { organization: organization.name })}
      captionHidden
      columns={columns}
      data={paged.rows}
      getRowId={(connector) => connector.id}
      status={dataTableStatusOf(connectors)}
      pagination={paged.pagination}
      stateHeadingLevel={2}
      renderCard={(connector) => (
        <div className="flex flex-col gap-2">
          <span className="flex items-start justify-between gap-2">
            <ConnectorName connector={connector} />
            <ConnectorStatus status={connector.status} />
          </span>
          <span className="text-xs text-muted-foreground">
            <Tools connector={connector} /> · <SecretState connector={connector} />
          </span>
          {actions === null ? null : <Actions connector={connector} actions={actions} />}
        </div>
      )}
      empty={
        <EmptyState
          frame="plain"
          headingLevel={2}
          icon="plug"
          title={t("emptyTitle")}
          description={onCreate === null ? t("emptyDescriptionNoPermission") : t("emptyDescription")}
          action={onCreate === null ? undefined : <Button onClick={onCreate}>{t("create")}</Button>}
        />
      }
    />
  );
}

/** The four dialogs of the page; each mounts its body only while open. */
function useConnectorDialogs() {
  const [editor, setEditor] = useState<{ connector: Connector | null } | null>(null);
  const [secret, setSecret] = useState<Connector | null>(null);
  const [toggling, setToggling] = useState<Connector | null>(null);
  const [removing, setRemoving] = useState<Connector | null>(null);
  const actions = useMemo<RowActions>(() => ({ edit: (connector) => setEditor({ connector }), secret: setSecret, toggle: setToggling, remove: setRemoving }), []);
  return { editor, setEditor, secret, setSecret, toggling, setToggling, removing, setRemoving, actions };
}

function SettingsConnectors({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.connectors");
  const online = useOnlineStatus();
  const { organization } = context;
  const canWrite = context.permissions.includes("core.connector.write");
  const dialogs = useConnectorDialogs();
  const writable = canWrite && online;
  const create = (): void => dialogs.setEditor({ connector: null });
  return (
    <SettingsPageFrame width="wide"
      organizationId={organization.id}
      allowed={context.permissions.includes("core.connector.read")}
      header={
        <PageHeader
          eyebrow={t("eyebrow", { organization: organization.name })}
          title={t("title")}
          description={t("description")}
          actions={
            canWrite ? (
              <Button onClick={create} disabled={!online}>
                <Icon name="plus" />
                {t("create")}
              </Button>
            ) : undefined
          }
        />
      }
    >
      <div className="flex flex-col gap-4">
        {online ? null : <OfflineNotice />}
        <Alert>
          <AlertDescription>{t("limitNotice")}</AlertDescription>
        </Alert>
        <ConnectorsTable context={context} actions={writable ? dialogs.actions : null} onCreate={writable ? create : null} />
      </div>
      {canWrite ? (
        <>
          <ConnectorEditorDialog organizationId={organization.id} open={dialogs.editor !== null} connector={dialogs.editor?.connector ?? null} onOpenChange={(open) => !open && dialogs.setEditor(null)} />
          <ConnectorSecretDialog organizationId={organization.id} connector={dialogs.secret} onOpenChange={(open) => !open && dialogs.setSecret(null)} />
          <ToggleConnectorDialog organizationId={organization.id} connector={dialogs.toggling} onOpenChange={(open) => !open && dialogs.setToggling(null)} />
          <DeleteConnectorDialog organizationId={organization.id} connector={dialogs.removing} onOpenChange={(open) => !open && dialogs.setRemoving(null)} />
        </>
      ) : null}
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/connectors` (SP5 spec §7, core.connector.read): the organization's
 * connectors (OpenAPI, MCP, Postgres read-only, browser) with status, whether a secret is stored
 * (never the secret or its reference) and how many tools agents may call; create, edit, set the
 * secret, enable or disable and delete need core.connector.write. There is no connection test and
 * no remote tool listing in `/v1`, so tool names are typed by hand and the page says so.
 */
export function SettingsConnectorsView() {
  const t = useTranslations("settings.connectors");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsConnectors context={data} />}
    </QueryPage>
  );
}
