"use client";

import { type Project, updateProjectEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslations } from "use-intl";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import { queryKeys } from "#/shared/api/query-keys.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { SchemaForm } from "#/shared/ui/organisms/SchemaForm/SchemaForm.tsx";
import type { SchemaFormResult } from "#/shared/ui/organisms/SchemaForm/server-errors.ts";
import {
  changedProject,
  type ProjectForm,
  ProjectFormContract,
  projectFormValues,
} from "../model/project-form.contract.ts";

export type EditProjectDialogProps = {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Renames a project and changes its description (`PATCH /v1/projects/{id}`, core.project.update).
 * Sends only what changed; afterwards everything of the organization refetches (the project lists,
 * the access contexts that carry the project and the switcher).
 */
export function EditProjectDialog({ project, open, onOpenChange }: EditProjectDialogProps) {
  const t = useTranslations("shell.projects.edit");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const initial = useMemo(() => projectFormValues(project), [project]);
  const submit = async (values: ProjectForm): Promise<SchemaFormResult> => {
    const body = changedProject(initial, values);
    if (body !== null) {
      try {
        await callEndpoint(updateProjectEndpoint, { params: { projectId: project.id }, body });
      } catch (error: unknown) {
        if (error instanceof ApiError) return { ok: false, error };
        throw error;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.organization(project.tenantId) });
      notify.success(t("saved", { name: values.name }));
    }
    onOpenChange(false);
    return { ok: true };
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <SchemaForm contract={ProjectFormContract} defaultValues={initial} onSubmit={submit} requireChanges />
      </DialogContent>
    </Dialog>
  );
}
