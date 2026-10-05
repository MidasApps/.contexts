"use client";

import type { PlatformStaff } from "@core/contracts";
import { useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { AdminUserRef, useAdminUserNames } from "#/entities/admin-user/index.ts";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { usePlatformStaff } from "#/entities/platform-staff/index.ts";
import { useMe } from "#/entities/session/index.ts";
import {
  AddStaffDialog,
  RevokeStaffDialog,
  StaffRoleDialog,
  type StaffTarget,
} from "#/features/admin-manage-staff/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { Badge } from "#/shared/ui/atoms/Badge/Badge.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { AdminPageFrame, AdminQuerySection } from "#/widgets/admin-nav/index.ts";

const column = dataTableColumnHelper<PlatformStaff>();

type Actions = {
  selfUid: string | undefined;
  labelOf: (uid: string) => string;
  onRole: (target: StaffTarget) => void;
  onRevoke: (target: StaffTarget) => void;
};

/** Change role (or give access again) and revoke; nothing on one's own row, which the API refuses. */
function RowActions({ staff, actions }: { staff: PlatformStaff; actions: Actions }) {
  const t = useTranslations("admin.team");
  if (staff.uid === actions.selfUid) return <Badge variant="secondary">{t("you")}</Badge>;
  const target = { uid: staff.uid, label: actions.labelOf(staff.uid), role: staff.role };
  return (
    <span className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => actions.onRole(target)}
        aria-label={t(staff.isActive ? "changeRoleNamed" : "restoreNamed", { name: target.label })}
      >
        {t(staff.isActive ? "changeRole" : "restore")}
      </Button>
      {staff.isActive ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => actions.onRevoke(target)}
          aria-label={t("revokeNamed", { name: target.label })}
        >
          {t("revokeAction")}
        </Button>
      ) : null}
    </span>
  );
}

const useColumns = (actions: Actions) => {
  const t = useTranslations("admin.team");
  const formatDateTime = useFormatDateTime();
  return useMemo(
    () => [
      column.display({
        id: "person",
        header: () => t("columns.person"),
        cell: ({ row }) => <AdminUserRef id={row.original.uid} label={actions.labelOf(row.original.uid)} />,
      }),
      column.display({
        id: "role",
        header: () => t("columns.role"),
        cell: ({ row }) => t(`roles.${row.original.role}.name`),
      }),
      column.display({
        id: "status",
        header: () => t("columns.status"),
        cell: ({ row }) =>
          row.original.isActive ? (
            <StatusPill tone="emerald">{t("active")}</StatusPill>
          ) : (
            <StatusPill tone="neutral">{t("revoked")}</StatusPill>
          ),
      }),
      column.accessor("updatedAt", {
        header: () => t("columns.updatedAt"),
        cell: ({ getValue }) => formatDateTime(getValue()),
      }),
      column.display({
        id: "actions",
        header: () => t("columns.actions"),
        meta: { headerHidden: true },
        cell: ({ row }) => <RowActions staff={row.original} actions={actions} />,
      }),
    ],
    [actions, formatDateTime, t],
  );
};

function StaffTable({ staff, actions }: { staff: readonly PlatformStaff[]; actions: Actions }) {
  const t = useTranslations("admin.team");
  const columns = useColumns(actions);
  // Active first, then by name; revoked records stay listed so access can be given back.
  const rows = useMemo(
    () =>
      [...staff].sort((a, b) =>
        a.isActive === b.isActive ? actions.labelOf(a.uid).localeCompare(actions.labelOf(b.uid)) : a.isActive ? -1 : 1,
      ),
    [actions, staff],
  );
  return (
    <DataTable
      caption={t("caption")}
      captionHidden
      columns={columns}
      data={rows}
      getRowId={(row) => row.uid}
      stateHeadingLevel={2}
      empty={<EmptyState frame="plain" headingLevel={2} icon="users" title={t("emptyTitle")} />}
    />
  );
}

/**
 * `/admin/team` (platform.staff.manage, platform admins; decision 0075): who is platform staff,
 * with which of the two fixed roles; add a person by email, change a role, revoke or give access
 * back. One's own row has no actions (the API refuses it). Staff always need two-step verification.
 */
export function AdminTeamView() {
  const t = useTranslations("admin.team");
  const permissions = usePlatformPermissions();
  const staff = usePlatformStaff({ enabled: permissions.can("platform.staff.manage") });
  const selfUid = useMe().data?.uid;
  const labelOf = useAdminUserNames(
    (staff.data ?? []).map((row) => row.uid),
    {
      enabled: permissions.can("platform.user.read"),
    },
  );
  const [adding, setAdding] = useState(false);
  const [changing, setChanging] = useState<StaffTarget | null>(null);
  const [revoking, setRevoking] = useState<StaffTarget | null>(null);
  const actions = useMemo<Actions>(
    () => ({ selfUid, labelOf, onRole: setChanging, onRevoke: setRevoking }),
    [labelOf, selfUid],
  );
  return (
    <AdminPageFrame
      permission="platform.staff.manage"
      title={t("title")}
      description={t("description")}
      actions={
        <Button onClick={() => setAdding(true)}>
          <Icon name="user-plus" />
          {t("add.action")}
        </Button>
      }
    >
      <AdminQuerySection query={staff} loadingLabel={t("loading")}>
        {(data) => <StaffTable staff={data} actions={actions} />}
      </AdminQuerySection>
      <AddStaffDialog open={adding} onOpenChange={setAdding} />
      <StaffRoleDialog target={changing} onOpenChange={(open) => !open && setChanging(null)} />
      <RevokeStaffDialog target={revoking} onOpenChange={(open) => !open && setRevoking(null)} />
    </AdminPageFrame>
  );
}
