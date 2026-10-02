"use client";

import type { AccessContext, Permission, Role } from "@core/contracts";
import { useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { PERSON_SYSTEM_ROLES, usePermissionsCatalog, useRoles } from "#/entities/role/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { DeleteRoleDialog, RoleEditorDialog } from "#/features/edit-role/index.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableStatusOf } from "#/shared/ui/organisms/DataTable/data-table-status.ts";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";

const column = dataTableColumnHelper<Role>();
type RoleActions = { onEdit: ((role: Role) => void) | null; onDelete: ((role: Role) => void) | null };

function RoleRowActions({ item: role, actions }: { item: Role; actions: RoleActions }) {
  const t = useTranslations("settings.roles");
  return (
    <span className="flex gap-1">
      {actions.onEdit === null ? null : (
        <Button variant="outline" size="sm" onClick={() => actions.onEdit?.(role)} aria-label={t("editNamed", { name: role.name })}>
          {t("edit")}
        </Button>
      )}
      {actions.onDelete === null ? null : (
        <Button variant="ghost" size="sm" onClick={() => actions.onDelete?.(role)} aria-label={t("deleteNamed", { name: role.name })}>
          {t("deleteAction")}
        </Button>
      )}
    </span>
  );
}

const useColumns = (actions: RoleActions) => {
  const t = useTranslations("settings.roles");
  return useMemo(
    () => [
      column.accessor("name", {
        header: () => t("columns.name"),
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span className="font-medium">{row.original.name}</span>
            {row.original.description === "" ? null : <span className="text-xs text-muted-foreground">{row.original.description}</span>}
          </span>
        ),
      }),
      column.accessor("permissions", { header: () => t("columns.permissions"), meta: { numeric: true }, cell: ({ getValue }) => t("permissionCount", { count: getValue().length }) }),
      column.display({ id: "actions", header: () => t("columns.actions"), meta: { headerHidden: true }, cell: ({ row }) => <RoleRowActions item={row.original} actions={actions} /> }),
    ],
    [actions, t],
  );
};

/** The fixed system roles, for reference next to the custom ones. */
function SystemRoles() {
  const t = useTranslations("settings.roles");
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {PERSON_SYSTEM_ROLES.map((key) => (
        <li key={key} className="rounded-lg border border-border p-3">
          <p className="text-sm font-medium">{t(`system.${key}.name`)}</p>
          <p className="text-xs text-muted-foreground">{t(`system.${key}.description`)}</p>
        </li>
      ))}
    </ul>
  );
}

function CustomRoles({ context, onCreate }: { context: AccessContext; onCreate: (() => void) | null }) {
  const t = useTranslations("settings.roles");
  const { organization } = context;
  const roles = useRoles(organization.id);
  const catalog = usePermissionsCatalog();
  const [editing, setEditing] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const canUpdate = context.permissions.includes("core.role.update");
  const canDelete = context.permissions.includes("core.role.delete");
  const actions = useMemo<RoleActions>(() => ({ onEdit: canUpdate ? setEditing : null, onDelete: canDelete ? setDeleting : null }), [canUpdate, canDelete]);
  const columns = useColumns(actions);
  const grantable = (permission: Permission): boolean => context.permissions.includes(permission);
  return (
    <>
      <DataTable
        caption={t("customCaption")}
        captionHidden
        columns={columns}
        data={roles.data ?? []}
        getRowId={(role) => role.id}
        status={dataTableStatusOf(roles)}
        renderCard={(role) => (
          <div className="flex flex-col gap-2">
            <span className="font-medium">{role.name}</span>
            {role.description === "" ? null : <span className="text-xs text-muted-foreground">{role.description}</span>}
            <span className="text-xs">{t("permissionCount", { count: role.permissions.length })}</span>
            <RoleRowActions item={role} actions={actions} />
          </div>
        )}
        empty={
          <EmptyState
            frame="plain"
            headingLevel={3}
            icon="shield"
            title={t("emptyTitle")}
            description={onCreate === null ? t("emptyDescriptionNoPermission") : t("emptyDescription")}
            action={onCreate === null ? undefined : <Button onClick={onCreate}>{t("create")}</Button>}
          />
        }
      />
      <RoleEditorDialog
        organizationId={organization.id}
        customRole={editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        permissions={catalog.data ?? []}
        grantable={grantable}
      />
      <DeleteRoleDialog organizationId={organization.id} customRole={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </>
  );
}

function SettingsRoles({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.roles");
  const online = useOnlineStatus();
  const { organization } = context;
  const [creating, setCreating] = useState(false);
  const canCreate = context.permissions.includes("core.role.create");
  const catalog = usePermissionsCatalog();
  const grantable = (permission: Permission): boolean => context.permissions.includes(permission);
  const create = canCreate && online ? () => setCreating(true) : null;
  return (
    <SettingsPageFrame
      organizationId={organization.id}
      allowed={context.permissions.includes("core.role.read")}
      header={
        <PageHeader
          eyebrow={t("eyebrow", { organization: organization.name })}
          title={t("title")}
          description={t("description")}
          actions={
            canCreate ? (
              <Button onClick={() => setCreating(true)} disabled={!online || catalog.isPending} pending={catalog.isPending}>
                <Icon name="plus" />
                {t("create")}
              </Button>
            ) : undefined
          }
        />
      }
    >
      <div className="flex flex-col gap-6">
        <SectionCard title={t("customTitle")} description={t("customDescription")}>
          <CustomRoles context={context} onCreate={create} />
        </SectionCard>
        <SectionCard title={t("systemTitle")} description={t("systemDescription")}>
          <SystemRoles />
        </SectionCard>
      </div>
      {canCreate ? (
        <RoleEditorDialog organizationId={organization.id} customRole={null} open={creating} onOpenChange={setCreating} permissions={catalog.data ?? []} grantable={grantable} />
      ) : null}
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/roles` (SP2 spec §8, core.role.read): custom roles (create, edit
 * with the permission picker grouped by module, delete; `ROLE_IN_USE` explained) next to the
 * fixed system roles.
 */
export function SettingsRolesView() {
  const t = useTranslations("settings.roles");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsRoles context={data} />}
    </QueryPage>
  );
}
