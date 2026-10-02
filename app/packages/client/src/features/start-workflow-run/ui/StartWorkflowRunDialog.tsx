"use client";

import { startWorkflowRunEndpoint, type WorkflowCatalogEntry } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { tenantWorkflowRunKeys } from "#/entities/workflow-run/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useIdempotencyKey } from "#/shared/api/use-idempotency-key.ts";
import { useWorkflowInputLabel, useWorkflowLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldGroup, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { JsonSchemaFields } from "#/shared/ui/organisms/JsonSchemaFields/JsonSchemaFields.tsx";
import { useJsonSchemaInput } from "#/shared/ui/organisms/JsonSchemaFields/use-json-schema-input.ts";

export type StartWorkflowRunDialogProps = {
  organizationId: string;
  /** The organization's workflow catalog; only the startable ones are offered. */
  workflows: readonly WorkflowCatalogEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new run so the page can open it. */
  onStarted: (runId: string) => void;
  /** Preselected workflow ("run again" from a run page). */
  initialWorkflowId?: string | undefined;
  /** Input the fields start from instead of the schema defaults. */
  initialInput?: Readonly<Record<string, unknown>> | undefined;
};

const NO_INPUT: Readonly<Record<string, unknown>> = {};

function WorkflowSelectField({ startable, workflowId, onChange, invalid }: { startable: readonly WorkflowCatalogEntry[]; workflowId: string | undefined; onChange: (id: string) => void; invalid: boolean }) {
  const t = useTranslations("settings.workflows.startDialog");
  const workflowLabel = useWorkflowLabel();
  const selected = startable.find((workflow) => workflow.id === workflowId);
  const description = selected === undefined ? "" : workflowLabel.description(selected.id, selected.description);
  return (
    <Field>
      <FieldLabel>{t("workflow")}</FieldLabel>
      <Select value={workflowId ?? ""} onValueChange={onChange}>
        <FieldControl>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("workflowPlaceholder")} />
          </SelectTrigger>
        </FieldControl>
        <SelectContent>
          {startable.map((workflow) => (
            <SelectItem key={workflow.id} value={workflow.id}>
              {workflowLabel.name(workflow.id)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description === "" ? null : <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={[invalid ? t("errors.workflow") : undefined]} />
    </Field>
  );
}

function StartWorkflowRunForm({ organizationId, workflows, onOpenChange, onStarted, initialWorkflowId, initialInput = NO_INPUT }: StartWorkflowRunDialogProps) {
  const t = useTranslations("settings.workflows.startDialog");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  const startable = workflows.filter((workflow) => workflow.startable);
  const [workflowId, setWorkflowId] = useState<string | undefined>(() => (startable.some((workflow) => workflow.id === initialWorkflowId) ? initialWorkflowId : undefined));
  const [workflowMissing, setWorkflowMissing] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const selected = startable.find((workflow) => workflow.id === workflowId);
  const input = useJsonSchemaInput(selected?.inputSchema ?? null, initialInput);
  const workflowLabel = useWorkflowLabel();
  const inputLabel = useWorkflowInputLabel();

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const inputData = input.read();
    setWorkflowMissing(selected === undefined);
    setFailure(null);
    if (selected === undefined || inputData === null) return;
    setPending(true);
    try {
      const body = { inputData };
      const { data } = await callEndpoint(startWorkflowRunEndpoint, {
        params: { workflowId: selected.id },
        query: { organizationId },
        body,
        idempotencyKey: idempotency.keyFor({ organizationId, workflowId: selected.id, ...body }),
      });
      idempotency.reset();
      await queryClient.invalidateQueries({ queryKey: tenantWorkflowRunKeys.all(organizationId) });
      notify.success(t("started", { workflow: workflowLabel.name(selected.id) }));
      onOpenChange(false);
      onStarted(data.runId);
    } catch (error: unknown) {
      // Field refusals go next to their field; anything else is the form's alert.
      if (!input.applyFailure(error)) setFailure(error);
    } finally {
      setPending(false);
    }
  };

  if (startable.length === 0) return <p className="text-sm text-muted-foreground">{t("noneStartable")}</p>;
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
      {failure === null ? null : <ApiErrorAlert error={failure} />}
      <FieldGroup>
        <WorkflowSelectField startable={startable} workflowId={workflowId} onChange={setWorkflowId} invalid={workflowMissing && selected === undefined} />
        {selected === undefined ? null : (
          <JsonSchemaFields
            plan={input.plan}
            draft={input.draft}
            onDraftChange={input.setDraft}
            problems={input.problems}
            labelOf={(field) => inputLabel(selected.id, field)}
            jsonHint={t("inputHint")}
          />
        )}
      </FieldGroup>
      <DialogFooter className="sticky bottom-0 bg-background pt-2">
        <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
          {t("cancel")}
        </Button>
        <Button type="submit" pending={pending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Starts a run of a startable workflow (`POST /v1/workflows/{workflowId}/runs`,
 * core.workflow-run.start): the workflow, and its input as fields drawn from the workflow's JSON
 * Schema (or JSON text when the schema is not a flat object; nothing when it declares none). The
 * server validates again; its field refusals land next to the field. The form mounts on open, so
 * a closed dialog keeps no draft.
 */
export function StartWorkflowRunDialog(props: StartWorkflowRunDialogProps) {
  const t = useTranslations("settings.workflows.startDialog");
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <StartWorkflowRunForm {...props} />
      </DialogContent>
    </Dialog>
  );
}
