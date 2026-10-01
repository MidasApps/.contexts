"use client";

import { startWorkflowRunEndpoint, type WorkflowCatalogEntry } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { tenantWorkflowRunKeys } from "#/entities/workflow-run/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useIdempotencyKey } from "#/shared/api/use-idempotency-key.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { Textarea } from "#/shared/ui/atoms/Textarea/Textarea.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldGroup, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { parseWorkflowInput } from "../model/workflow-input.ts";

export type StartWorkflowRunDialogProps = {
  organizationId: string;
  /** The organization's workflow catalog; only the startable ones are offered. */
  workflows: readonly WorkflowCatalogEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new run so the page can open it. */
  onStarted: (runId: string) => void;
};

type Problems = { workflow?: true; input?: true };

function InputSchemaHelp({ workflow }: { workflow: WorkflowCatalogEntry | undefined }) {
  const t = useTranslations("settings.workflows.startDialog");
  if (workflow === undefined) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-[13px] font-medium">{t("schemaTitle")}</h3>
      {workflow.inputSchema === null ? (
        <p className="text-sm text-muted-foreground">{t("noSchema")}</p>
      ) : (
        // Wrapped, not scrolled: a scroll area would need its own keyboard focus; the form already scrolls.
        <pre className="rounded-md bg-muted p-3 font-mono text-xs break-words whitespace-pre-wrap">
          {JSON.stringify(workflow.inputSchema, null, 2)}
        </pre>
      )}
    </div>
  );
}

function StartWorkflowRunForm({ organizationId, workflows, onOpenChange, onStarted }: StartWorkflowRunDialogProps) {
  const t = useTranslations("settings.workflows.startDialog");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  const startable = workflows.filter((workflow) => workflow.startable);
  const [workflowId, setWorkflowId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState("{}");
  const [problems, setProblems] = useState<Problems>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const selected = startable.find((workflow) => workflow.id === workflowId);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const inputData = parseWorkflowInput(input);
    setProblems({ ...(selected === undefined ? { workflow: true } : {}), ...(inputData === null ? { input: true } : {}) });
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
      notify.success(t("started", { workflow: selected.id }));
      onOpenChange(false);
      onStarted(data.runId);
    } catch (error: unknown) {
      setFailure(error);
    } finally {
      setPending(false);
    }
  };

  if (startable.length === 0) return <p className="text-sm text-muted-foreground">{t("noneStartable")}</p>;
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
      {failure === null ? null : <ApiErrorAlert error={failure} />}
      <FieldGroup>
        <Field>
          <FieldLabel>{t("workflow")}</FieldLabel>
          <Select value={workflowId ?? ""} onValueChange={setWorkflowId}>
            <FieldControl>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("workflowPlaceholder")} />
              </SelectTrigger>
            </FieldControl>
            <SelectContent>
              {startable.map((workflow) => (
                <SelectItem key={workflow.id} value={workflow.id}>
                  {workflow.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected === undefined || selected.description === "" ? null : <FieldDescription>{selected.description}</FieldDescription>}
          <FieldError errors={[problems.workflow === true ? t("errors.workflow") : undefined]} />
        </Field>
        <Field>
          <FieldLabel>{t("input")}</FieldLabel>
          <FieldControl>
            <Textarea className="font-mono text-[13px]" rows={5} spellCheck={false} value={input} onChange={(event) => setInput(event.target.value)} />
          </FieldControl>
          <FieldDescription>{t("inputHint")}</FieldDescription>
          <FieldError errors={[problems.input === true ? t("errors.input") : undefined]} />
        </Field>
        <InputSchemaHelp workflow={selected} />
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
 * core.workflow-run.start): the workflow, and its input as a JSON object checked on the client for
 * being JSON only; the workflow's own schema is shown as help and enforced by the server. The form
 * mounts on open, so a closed dialog keeps no draft.
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
