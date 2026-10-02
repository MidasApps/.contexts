"use client";

import type { AccessContext, Invitation, InvitationStatus } from "@core/contracts";
import { useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { INVITATIONS_PAGE_LIMIT, useInvitations } from "#/entities/invitation/index.ts";
import { useRoleRefLabel, useRoles } from "#/entities/role/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { InviteMemberDialog, RevokeInvitationDialog } from "#/features/invite-member/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { useCursorPages } from "#/shared/lib/pagination/use-cursor-pages.ts";
import { Badge } from "#/shared/ui/atoms/Badge/Badge.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { StatusPill, type StatusTone } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/shared/ui/molecules/Tabs/Tabs.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableStatusOf } from "#/shared/ui/organisms/DataTable/data-table-status.ts";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { NodeName } from "#/widgets/access-node/index.ts";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";

const column = dataTableColumnHelper<Invitation>();
const TONES: Record<InvitationStatus, StatusTone> = { pending: "blue", accepted: "emerald", revoked: "neutral", expired: "amber" };
type Filter = "pending" | "all";

function InvitationStatusPill({ status }: { status: InvitationStatus }) {
  const t = useTranslations("settings.invitations.status");
  return <StatusPill tone={TONES[status]}>{t(status)}</StatusPill>;
}

function RoleBadges({ invitation, labelOf }: { invitation: Invitation; labelOf: (ref: Invitation["roles"][number]) => string }) {
  return (
    <span className="flex flex-wrap gap-1">
      {invitation.roles.map((ref) => (
        <Badge key={JSON.stringify(ref)} variant="outline">
          {labelOf(ref)}
        </Badge>
      ))}
    </span>
  );
}

function RevokeButton({ invitation, onRevoke }: { invitation: Invitation; onRevoke: (invitation: Invitation) => void }) {
  const t = useTranslations("settings.invitations");
  if (invitation.status !== "pending") return null;
  return (
    <Button variant="outline" size="sm" onClick={() => onRevoke(invitation)} aria-label={t("revokeNamed", { email: invitation.email })}>
      {t("revokeAction")}
    </Button>
  );
}

const useColumns = (labelOf: (ref: Invitation["roles"][number]) => string, onRevoke: ((invitation: Invitation) => void) | null) => {
  const t = useTranslations("settings.invitations");
  const formatDateTime = useFormatDateTime();
  return useMemo(
    () => [
      column.accessor("email", { header: () => t("columns.email"), cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> }),
      column.display({ id: "node", header: () => t("columns.node"), cell: ({ row }) => <NodeName node={row.original.node} /> }),
      column.display({ id: "roles", header: () => t("columns.roles"), cell: ({ row }) => <RoleBadges invitation={row.original} labelOf={labelOf} /> }),
      column.accessor("status", { header: () => t("columns.status"), cell: ({ getValue }) => <InvitationStatusPill status={getValue()} /> }),
      column.accessor("expiresAt", { header: () => t("columns.expires"), cell: ({ getValue }) => formatDateTime(getValue()) }),
      ...(onRevoke === null
        ? []
        : [column.display({ id: "actions", header: () => t("columns.actions"), meta: { headerHidden: true }, cell: ({ row }) => <RevokeButton invitation={row.original} onRevoke={onRevoke} /> })]),
    ],
    [formatDateTime, labelOf, onRevoke, t],
  );
};

function InvitationsTable({ context, filter, onInvite }: { context: AccessContext; filter: Filter; onInvite: (() => void) | null }) {
  const t = useTranslations("settings.invitations");
  const formatDateTime = useFormatDateTime();
  const { organization } = context;
  const invitations = useInvitations(organization.id, filter === "pending" ? { status: "pending" } : {});
  const roles = useRoles(organization.id);
  const labelOf = useRoleRefLabel(roles.data);
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const canRevoke = context.permissions.includes("core.member.invite");
  const columns = useColumns(labelOf, canRevoke ? setRevoking : null);
  const paged = useCursorPages(invitations, INVITATIONS_PAGE_LIMIT, t("pagination"));
  const invite = onInvite === null ? undefined : <Button onClick={onInvite}>{t("invite")}</Button>;
  return (
    <>
      <DataTable
        caption={filter === "pending" ? t("captionPending") : t("captionAll")}
        captionHidden
        columns={columns}
        data={paged.rows}
        getRowId={(invitation) => invitation.id}
        status={dataTableStatusOf(invitations)}
        pagination={paged.pagination}
        stateHeadingLevel={2}
        renderCard={(invitation) => (
          <div className="flex flex-col gap-2">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{invitation.email}</span>
              <InvitationStatusPill status={invitation.status} />
            </span>
            <span className="text-[13px]">
              <NodeName node={invitation.node} />
            </span>
            <RoleBadges invitation={invitation} labelOf={labelOf} />
            <span className="text-xs text-muted-foreground">{t("expiresOn", { date: formatDateTime(invitation.expiresAt) })}</span>
            {canRevoke ? (
              <span className="self-start">
                <RevokeButton invitation={invitation} onRevoke={setRevoking} />
              </span>
            ) : null}
          </div>
        )}
        empty={<EmptyState frame="plain" headingLevel={2} icon="user-plus" title={filter === "pending" ? t("emptyPendingTitle") : t("emptyTitle")} description={t("emptyDescription")} action={invite} />}
      />
      <RevokeInvitationDialog organizationId={organization.id} invitation={revoking} onOpenChange={(open) => !open && setRevoking(null)} />
    </>
  );
}

function SettingsInvitations({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.invitations");
  const online = useOnlineStatus();
  const { organization } = context;
  const [filter, setFilter] = useState<Filter>("pending");
  const [inviting, setInviting] = useState(false);
  const canInvite = context.permissions.includes("core.member.invite");
  const roles = useRoles(canInvite ? organization.id : undefined);
  return (
    <SettingsPageFrame width="wide"
      organizationId={organization.id}
      allowed={canInvite}
      header={
        <PageHeader
          eyebrow={t("eyebrow", { organization: organization.name })}
          title={t("title")}
          description={t("description")}
          actions={
            canInvite ? (
              <Button onClick={() => setInviting(true)} disabled={!online}>
                <Icon name="user-plus" />
                {t("invite")}
              </Button>
            ) : undefined
          }
        />
      }
    >
      <div className="flex flex-col gap-4">
        <Tabs value={filter} onValueChange={(value) => setFilter(value === "all" ? "all" : "pending")}>
          <TabsList aria-label={t("filterLabel")}>
            <TabsTrigger value="pending">{t("filters.pending")}</TabsTrigger>
            <TabsTrigger value="all">{t("filters.all")}</TabsTrigger>
          </TabsList>
          {(["pending", "all"] as const).map((value) => (
            <TabsContent key={value} value={value}>
              <InvitationsTable context={context} filter={value} onInvite={canInvite && online ? () => setInviting(true) : null} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
      {canInvite ? <InviteMemberDialog organization={organization} customRoles={roles.data} open={inviting} onOpenChange={setInviting} /> : null}
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/invitations` (SP2 spec §8, core.member.invite): pending (or all)
 * invitations with node, roles, status and expiry; invite (the link is shown once) and revoke.
 */
export function SettingsInvitationsView() {
  const t = useTranslations("settings.invitations");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsInvitations context={data} />}
    </QueryPage>
  );
}
