"use client";

import type { AccessContext, Member, Role } from "@core/contracts";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { MEMBERS_PAGE_LIMIT, MemberChip, useMembers } from "#/entities/member/index.ts";
import { useRoleRefLabel, useRoles } from "#/entities/role/index.ts";
import { useAccessContext, useCurrentNode, useMe } from "#/entities/session/index.ts";
import { InviteMemberDialog } from "#/features/invite-member/index.ts";
import { EditGrantRolesDialog, RemoveMemberDialog } from "#/features/manage-membership/index.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { useCursorPages } from "#/shared/lib/pagination/use-cursor-pages.ts";
import { Badge } from "#/shared/ui/atoms/Badge/Badge.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableStatusOf } from "#/shared/ui/organisms/DataTable/data-table-status.ts";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { NodeName } from "#/widgets/access-node/index.ts";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";

type Grant = Member["grants"][number];
type Actions = { canUpdate: boolean; canRemove: boolean; onEdit: (member: Member, grant: Grant) => void; onRemove: (member: Member) => void };

const column = dataTableColumnHelper<Member>();
const memberName = (member: Member): string => (member.displayName === "" ? member.email : member.displayName);

function MemberIdentity({ member, isSelf }: { member: Member; isSelf: boolean }) {
  const t = useTranslations("settings.members");
  return (
    <span className="flex items-center gap-2">
      <MemberChip displayName={member.displayName} email={member.email} />
      {isSelf ? <Badge variant="secondary">{t("you")}</Badge> : null}
    </span>
  );
}

/** Every grant of a member: where it applies and its roles, with "Edit roles" when allowed. */
function Grants({ member, roles, actions }: { member: Member; roles: readonly Role[] | undefined; actions: Actions }) {
  const t = useTranslations("settings.members");
  const roleLabel = useRoleRefLabel(roles);
  return (
    <ul className="flex flex-col gap-2">
      {member.grants.map((grant) => (
        <li key={grant.membershipId} className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px]">
            <NodeName node={grant.node} />
          </span>
          {grant.roles.map((ref) => (
            <Badge key={JSON.stringify(ref)} variant="outline">
              {roleLabel(ref)}
            </Badge>
          ))}
          {actions.canUpdate ? (
            <Button variant="ghost" size="icon-xs" onClick={() => actions.onEdit(member, grant)}>
              <Icon name="pencil" />
              <span className="sr-only">{t("editRolesOf", { name: memberName(member) })}</span>
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const useColumns = (selfUid: string | undefined, roles: readonly Role[] | undefined, actions: Actions) => {
  const t = useTranslations("settings.members");
  return useMemo(
    () => [
      column.display({ id: "member", header: () => t("columns.member"), cell: ({ row }) => <MemberIdentity member={row.original} isSelf={row.original.uid === selfUid} /> }),
      column.display({ id: "access", header: () => t("columns.access"), cell: ({ row }) => <Grants member={row.original} roles={roles} actions={actions} /> }),
      column.display({
        id: "actions",
        header: () => t("columns.actions"),
        meta: { headerHidden: true },
        cell: ({ row }) =>
          actions.canRemove ? (
            <Button variant="outline" size="sm" onClick={() => actions.onRemove(row.original)} aria-label={t("removeNamed", { name: memberName(row.original) })}>
              {t("removeAction")}
            </Button>
          ) : null,
      }),
    ],
    [actions, roles, selfUid, t],
  );
};

function MembersTable({ context, inviteButton, canInvite }: { context: AccessContext; inviteButton: ReactNode; canInvite: boolean }) {
  const t = useTranslations("settings.members");
  const { organization } = context;
  const members = useMembers(organization.id);
  const roles = useRoles(organization.id);
  const self = useMe().data?.uid;
  const [editing, setEditing] = useState<{ member: Member; grant: Grant } | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const actions = useMemo<Actions>(
    () => ({
      canUpdate: context.permissions.includes("core.member.update"),
      canRemove: context.permissions.includes("core.member.remove"),
      onEdit: (member, grant) => setEditing({ member, grant }),
      onRemove: setRemoving,
    }),
    [context.permissions],
  );
  const columns = useColumns(self, roles.data, actions);
  const paged = useCursorPages(members, MEMBERS_PAGE_LIMIT, t("pagination"));
  return (
    <>
      <DataTable
        caption={t("caption", { organization: organization.name })}
        columns={columns}
        data={paged.rows}
        getRowId={(member) => member.uid}
        status={dataTableStatusOf(members)}
        pagination={paged.pagination}
        stateHeadingLevel={2}
        renderCard={(member) => (
          <div className="flex flex-col gap-3">
            <MemberIdentity member={member} isSelf={member.uid === self} />
            <Grants member={member} roles={roles.data} actions={actions} />
            {actions.canRemove ? (
              <Button variant="outline" size="sm" className="self-start" onClick={() => setRemoving(member)} aria-label={t("removeNamed", { name: memberName(member) })}>
                {t("removeAction")}
              </Button>
            ) : null}
          </div>
        )}
        empty={<EmptyState frame="plain" headingLevel={2} icon="users" title={t("emptyTitle")} description={canInvite ? t("emptyDescription") : t("emptyDescriptionNoPermission")} action={inviteButton} />}
      />
      <EditGrantRolesDialog
        organizationId={organization.id}
        target={editing}
        customRoles={roles.data}
        onOpenChange={(open) => !open && setEditing(null)}
        nodeLabel={editing === null ? null : <NodeName node={editing.grant.node} />}
      />
      <RemoveMemberDialog organizationId={organization.id} member={removing} onOpenChange={(open) => !open && setRemoving(null)} />
    </>
  );
}

function SettingsMembers({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.members");
  const online = useOnlineStatus();
  const { organization } = context;
  const [inviting, setInviting] = useState(false);
  const canInvite = context.permissions.includes("core.member.invite");
  const allowed = context.permissions.includes("core.member.read");
  const roles = useRoles(canInvite ? organization.id : undefined);
  const inviteButton = canInvite ? (
    <Button onClick={() => setInviting(true)} disabled={!online}>
      <Icon name="user-plus" />
      {t("invite")}
    </Button>
  ) : undefined;
  return (
    <SettingsPageFrame width="wide"
      organizationId={organization.id}
      allowed={allowed}
      header={<PageHeader eyebrow={t("eyebrow", { organization: organization.name })} title={t("title")} description={t("description")} actions={allowed ? inviteButton : undefined} />}
    >
      <MembersTable context={context} inviteButton={inviteButton} canInvite={canInvite} />
      {canInvite ? <InviteMemberDialog organization={organization} customRoles={roles.data} open={inviting} onOpenChange={setInviting} /> : null}
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/members` (SP2 spec §8, core.member.read): members with every grant
 * (node + roles), change roles per grant (core.member.update), remove (core.member.remove) and
 * invite (core.member.invite). `LAST_OWNER`/`ESCALATION_FORBIDDEN` stay in their dialogs.
 */
export function SettingsMembersView() {
  const t = useTranslations("settings.members");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsMembers context={data} />}
    </QueryPage>
  );
}
