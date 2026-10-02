"use client";

import type { AccessContext, ApiKey } from "@core/contracts";
import { useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { API_KEYS_PAGE_LIMIT, useApiKeys } from "#/entities/api-key/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { CreateApiKeyDialog } from "#/features/create-api-key/index.ts";
import { RevokeApiKeyDialog } from "#/features/revoke-api-key/index.ts";
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

const column = dataTableColumnHelper<ApiKey>();
type KeyState = "active" | "revoked" | "expired";

const keyState = (key: ApiKey, now: number): KeyState => (key.status === "revoked" ? "revoked" : Date.parse(key.expiresAt) <= now ? "expired" : "active");

function KeyStatus({ apiKey, now }: { apiKey: ApiKey; now: number }) {
  const t = useTranslations("settings.apiKeys.status");
  const state = keyState(apiKey, now);
  const tone = state === "active" ? "emerald" : state === "expired" ? "amber" : "neutral";
  return <StatusPill tone={tone}>{state === "revoked" && apiKey.revokedReason === "owner-removed" ? t("ownerRemoved") : t(state)}</StatusPill>;
}

function KeyName({ apiKey }: { apiKey: ApiKey }) {
  return (
    <span className="flex flex-col">
      <span className="font-medium">{apiKey.name}</span>
      <span className="font-mono text-[11.5px] text-muted-foreground">{apiKey.publicId}</span>
    </span>
  );
}

const useColumns = (now: number, onRevoke: ((key: ApiKey) => void) | null) => {
  const t = useTranslations("settings.apiKeys");
  const formatDateTime = useFormatDateTime();
  return useMemo(
    () => [
      column.display({ id: "name", header: () => t("columns.name"), cell: ({ row }) => <KeyName apiKey={row.original} /> }),
      column.display({ id: "node", header: () => t("columns.node"), cell: ({ row }) => <NodeName node={row.original.node} /> }),
      column.accessor("scopes", { header: () => t("columns.scopes"), meta: { numeric: true }, cell: ({ getValue }) => t("scopeCount", { count: getValue().length }) }),
      column.accessor("lastUsedAt", { header: () => t("columns.lastUsed"), cell: ({ getValue }) => (getValue() === null ? t("neverUsed") : formatDateTime(getValue() ?? "")) }),
      column.accessor("expiresAt", { header: () => t("columns.expires"), cell: ({ getValue }) => formatDateTime(getValue(), "date") }),
      column.display({ id: "status", header: () => t("columns.status"), cell: ({ row }) => <KeyStatus apiKey={row.original} now={now} /> }),
      column.display({
        id: "actions",
        header: () => t("columns.actions"),
        meta: { headerHidden: true },
        cell: ({ row }) =>
          onRevoke === null || keyState(row.original, now) !== "active" ? null : (
            <Button variant="outline" size="sm" onClick={() => onRevoke(row.original)} aria-label={t("revokeNamed", { name: row.original.name })}>
              {t("revokeAction")}
            </Button>
          ),
      }),
    ],
    [formatDateTime, now, onRevoke, t],
  );
};

function ApiKeysTable({ context, onCreate }: { context: AccessContext; onCreate: (() => void) | null }) {
  const t = useTranslations("settings.apiKeys");
  const formatDateTime = useFormatDateTime();
  const online = useOnlineStatus();
  const { organization } = context;
  const keys = useApiKeys(organization.id);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [now] = useState(() => Date.now());
  const canRevoke = context.permissions.includes("core.api-key.revoke");
  const columns = useColumns(now, canRevoke ? setRevoking : null);
  const paged = useCursorPages(keys, API_KEYS_PAGE_LIMIT, t("pagination"));
  return (
    <>
      <DataTable
        caption={t("caption", { organization: organization.name })}
        captionHidden
        columns={columns}
        data={paged.rows}
        getRowId={(key) => key.id}
        status={dataTableStatusOf(keys)}
        pagination={paged.pagination}
        stateHeadingLevel={2}
        renderCard={(key) => (
          <div className="flex flex-col gap-2">
            <span className="flex items-start justify-between gap-2">
              <KeyName apiKey={key} />
              <KeyStatus apiKey={key} now={now} />
            </span>
            <span className="text-[13px]">
              <NodeName node={key.node} />
            </span>
            <span className="text-xs text-muted-foreground">{t("cardMeta", { scopes: key.scopes.length, date: formatDateTime(key.expiresAt, "date") })}</span>
            {canRevoke && keyState(key, now) === "active" ? (
              <Button variant="outline" size="sm" className="self-start" onClick={() => setRevoking(key)} aria-label={t("revokeNamed", { name: key.name })}>
                {t("revokeAction")}
              </Button>
            ) : null}
          </div>
        )}
        empty={
          <EmptyState
            frame="plain"
            headingLevel={2}
            icon="key"
            title={t("emptyTitle")}
            description={onCreate === null ? t("emptyDescriptionNoPermission") : t("emptyDescription")}
            action={
              onCreate === null ? undefined : (
                <Button onClick={onCreate} disabled={!online}>
                  {t("create")}
                </Button>
              )
            }
          />
        }
      />
      <RevokeApiKeyDialog organizationId={organization.id} apiKey={revoking} onOpenChange={(open) => !open && setRevoking(null)} />
    </>
  );
}

function SettingsApiKeys({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.apiKeys");
  const online = useOnlineStatus();
  const { organization } = context;
  const [creating, setCreating] = useState(false);
  const canCreate = context.permissions.includes("core.api-key.create");
  return (
    <SettingsPageFrame width="wide"
      organizationId={organization.id}
      allowed={context.permissions.includes("core.api-key.read")}
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
      {/* The empty-state copy follows the permission; offline only holds the action (the shell says why). */}
      <ApiKeysTable context={context} onCreate={canCreate ? () => setCreating(true) : null} />
      {canCreate ? <CreateApiKeyDialog organization={organization} open={creating} onOpenChange={setCreating} /> : null}
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/api-keys` (SP2 spec §8, core.api-key.read): keys (never their
 * secrets) with node, scopes, last use, expiry and status; create (secret shown once) and revoke.
 */
export function SettingsApiKeysView() {
  const t = useTranslations("settings.apiKeys");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsApiKeys context={data} />}
    </QueryPage>
  );
}
