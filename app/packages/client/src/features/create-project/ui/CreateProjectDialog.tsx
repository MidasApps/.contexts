"use client";

import { createProjectEndpoint, type Project } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { ulid } from "ulid";
import { useTranslations } from "use-intl";
import { projectKeys } from "#/entities/project/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
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
import { type CreateProjectForm, CreateProjectFormContract } from "../model/create-project-form.contract.ts";

export type CreateProjectDialogProps = {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Where focus goes back on close when the opener is gone by then (the command palette closes
   * before this dialog opens); defaults to whatever had focus when the dialog opened.
   */
  returnFocusTo?: (() => HTMLElement | null) | undefined;
};

type Attempt = { key: string; body: string } | null;

/** Same body as the failed attempt → same `Idempotency-Key` (a retry); changed values → a new one. */
const keyFor = (attempt: { current: Attempt }, body: unknown): string => {
  const serialized = JSON.stringify(body);
  if (attempt.current?.body !== serialized) attempt.current = { key: ulid(), body: serialized };
  return attempt.current.key;
};

/**
 * "New project" (core.project.create at the organization): name and description in a modal, then
 * the project list refetches and the user lands on the new project. Opened from menus or the
 * command palette, so focus returns to whatever had it when the dialog opened.
 */
export function CreateProjectDialog({ organizationId, open, onOpenChange, returnFocusTo }: CreateProjectDialogProps) {
  const t = useTranslations("shell.projects.create");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const router = useRouter();
  const attempt = useRef<Attempt>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const submit = async (values: CreateProjectForm): Promise<SchemaFormResult> => {
    const body = {
      name: values.name,
      ...(values.description === undefined || values.description === "" ? {} : { description: values.description }),
    };
    let project: Project;
    try {
      project = (
        await callEndpoint(createProjectEndpoint, {
          params: { organizationId },
          body,
          idempotencyKey: keyFor(attempt, body),
        })
      ).data;
    } catch (error: unknown) {
      if (error instanceof ApiError) return { ok: false, error };
      throw error;
    }
    attempt.current = null;
    await queryClient.invalidateQueries({ queryKey: projectKeys.all(organizationId) });
    notify.success(t("created", { name: project.name }));
    onOpenChange(false);
    router.navigate({ id: "project", organizationId, projectId: project.id });
    return { ok: true };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={() => {
          returnFocus.current =
            returnFocusTo?.() ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocus.current === null || !returnFocus.current.isConnected) return;
          event.preventDefault();
          returnFocus.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <SchemaForm
          contract={CreateProjectFormContract}
          defaultValues={{ name: "" }}
          onSubmit={submit}
          submitLabelKey="shell.projects.create.submit"
          successMessageKey="shell.projects.create.createdStatus"
        />
      </DialogContent>
    </Dialog>
  );
}
