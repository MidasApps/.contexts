"use client";

import { deleteProjectEndpoint, type Project, updateProjectEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { queryKeys } from "#/shared/api/query-keys.ts";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/shared/ui/molecules/DropdownMenu/DropdownMenu.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";
import { EditProjectDialog } from "./EditProjectDialog.tsx";

export type ProjectActionsMenuProps = {
  project: Project;
  /** core.project.update at the project: edit, archive and reactivate. */
  canUpdate: boolean;
  /** core.project.delete at the project. */
  canDelete: boolean;
};

type Open = "edit" | "archive" | "delete" | null;

/** `PATCH status`; the organization's queries refetch so lists, header and switcher show it. */
const useSetStatus = (project: Project) => {
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  return async (status: Project["status"]): Promise<void> => {
    await callEndpoint(updateProjectEndpoint, { params: { projectId: project.id }, body: { status } });
    await queryClient.invalidateQueries({ queryKey: queryKeys.organization(project.tenantId) });
  };
};

/** `DELETE`, then the organization home (`replace`: Back must not reopen the deleted project). */
const useDeleteProject = (project: Project) => {
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const router = useRouter();
  return async (): Promise<void> => {
    await callEndpoint(deleteProjectEndpoint, { params: { projectId: project.id } });
    router.navigate({ id: "organization", organizationId: project.tenantId }, { replace: true });
    await queryClient.invalidateQueries({ queryKey: queryKeys.organization(project.tenantId) });
  };
};

function ProjectMenuItems({
  project,
  canUpdate,
  canDelete,
  onOpen,
  onReactivate,
}: ProjectActionsMenuProps & { onOpen: (open: Open) => void; onReactivate: () => void }) {
  const t = useTranslations("shell.projects.actions");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary">
          <Icon name="settings" />
          {t("menu")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canUpdate ? (
          <>
            <DropdownMenuItem onSelect={() => onOpen("edit")}>
              <Icon name="pencil" />
              {t("edit")}
            </DropdownMenuItem>
            {project.status === "archived" ? (
              <DropdownMenuItem onSelect={onReactivate}>
                <Icon name="refresh" />
                {t("reactivate")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => onOpen("archive")}>
                <Icon name="archive" />
                {t("archive")}
              </DropdownMenuItem>
            )}
          </>
        ) : null}
        {canUpdate && canDelete ? <DropdownMenuSeparator /> : null}
        {canDelete ? (
          <DropdownMenuItem variant="destructive" onSelect={() => onOpen("delete")}>
            <Icon name="trash" />
            {t("delete")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * "Project settings" on the project home: edit name and description, archive or reactivate
 * (core.project.update) and delete (core.project.delete, with its units). Archiving keeps the
 * project readable and marked as archived; deleting cannot be undone from the app.
 */
export function ProjectActionsMenu({ project, canUpdate, canDelete }: ProjectActionsMenuProps) {
  const t = useTranslations("shell.projects.actions");
  const describe = useDescribeError();
  const [open, setOpen] = useState<Open>(null);
  const setStatus = useSetStatus(project);
  const archive = useConfirmedAction(
    () => setStatus("archived"),
    () => notify.success(t("archived", { name: project.name })),
  );
  const remove = useConfirmedAction(useDeleteProject(project), () =>
    notify.success(t("deleted", { name: project.name })),
  );
  if (!canUpdate && !canDelete) return null;
  const reactivate = async (): Promise<void> => {
    try {
      await setStatus("active");
      notify.success(t("reactivated", { name: project.name }));
    } catch (error: unknown) {
      notify.error(describe(error).message);
    }
  };
  const closeWith =
    (action: { reset: () => void }) =>
    (next: boolean): void => {
      if (next) return;
      action.reset();
      setOpen(null);
    };
  return (
    <>
      <ProjectMenuItems
        project={project}
        canUpdate={canUpdate}
        canDelete={canDelete}
        onOpen={setOpen}
        onReactivate={() => void reactivate()}
      />
      {canUpdate ? (
        <EditProjectDialog project={project} open={open === "edit"} onOpenChange={(next) => !next && setOpen(null)} />
      ) : null}
      <ConfirmDialog
        open={open === "archive"}
        onOpenChange={closeWith(archive)}
        title={t("archiveTitle", { name: project.name })}
        description={t("archiveDescription")}
        confirmLabel={t("archiveConfirm")}
        onConfirm={archive.confirm}
        error={archive.error}
      />
      <ConfirmDialog
        open={open === "delete"}
        onOpenChange={closeWith(remove)}
        title={t("deleteTitle", { name: project.name })}
        description={t("deleteDescription")}
        confirmLabel={t("deleteConfirm")}
        destructive
        onConfirm={remove.confirm}
        error={remove.error}
      />
    </>
  );
}
