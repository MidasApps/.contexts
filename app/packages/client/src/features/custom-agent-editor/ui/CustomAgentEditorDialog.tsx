"use client";

import { createCustomAgentEndpoint, updateCustomAgentEndpoint, type CustomAgent, type CustomAgentOptions, type CustomSkill } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { useCustomAgent } from "#/entities/custom-agent/index.ts";
import { useCustomSkills } from "#/entities/custom-skill/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import { useIdempotencyKey } from "#/shared/api/use-idempotency-key.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Spinner } from "#/shared/ui/atoms/Spinner/Spinner.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { useDialogDismissGuard } from "#/shared/ui/molecules/Dialog/dialog-dismiss-guard.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { agentInputOf, agentProblemsFromDetails, draftFromAgent, emptyAgentDraft, type AgentDraft, type AgentDraftProblems } from "../model/custom-agent-draft.ts";
import { invalidateAgentData } from "../model/invalidate-agent-data.ts";
import { CustomAgentFields } from "./CustomAgentFields.tsx";

export type CustomAgentEditorDialogProps = {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Id and name of the agent to edit (its record is loaded here); absent creates one. */
  agent?: { readonly id: string; readonly name: string } | null | undefined;
  /** What an agent may select and the plan's limits (`GET /v1/agent-options`). */
  options: CustomAgentOptions;
};

type FormProps = { organizationId: string; agent: CustomAgent | null; options: CustomAgentOptions; skills: readonly CustomSkill[]; onClose: () => void };

function AgentForm({ organizationId, agent, options, skills, onClose }: FormProps) {
  const t = useTranslations("settings.agents.custom.editor");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  const [draft, keepDraft] = useState<AgentDraft>(() => (agent === null ? emptyAgentDraft() : draftFromAgent(agent)));
  // Typed work has no draft elsewhere: Esc, an outside click or the X ask before dropping it (decision 0048).
  const [dirty, setDirty] = useState(false);
  useDialogDismissGuard(dirty ? "confirmUnsaved" : "allow");
  const setDraft = (next: AgentDraft): void => {
    keepDraft(next);
    setDirty(true);
  };
  const [problems, setProblems] = useState<AgentDraftProblems>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const result = agentInputOf(draft, options.limits.maxInstructionChars);
    setFailure(null);
    setProblems(result.ok ? {} : result.problems);
    if (!result.ok) return;
    const { input } = result;
    setPending(true);
    try {
      if (agent === null) {
        await callEndpoint(createCustomAgentEndpoint, { query: { organizationId }, body: input, idempotencyKey: idempotency.keyFor(input) });
        idempotency.reset();
      } else {
        await callEndpoint(updateCustomAgentEndpoint, { params: { agentId: agent.id }, query: { organizationId }, body: input });
      }
      await invalidateAgentData(queryClient, organizationId);
      notify.success(t(agent === null ? "created" : "saved", { name: input.name }));
      onClose();
    } catch (error: unknown) {
      setFailure(error);
      if (error instanceof ApiError) setProblems(agentProblemsFromDetails(error.details));
    } finally {
      setPending(false);
    }
  };

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      {failure === null ? null : <ApiErrorAlert error={failure} />}
      <CustomAgentFields draft={draft} setDraft={setDraft} problems={problems} options={options} skills={skills} />
      <DialogFooter>
        <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" pending={pending}>
          {t(agent === null ? "submitCreate" : "submitSave")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function AgentEditorBody({ organizationId, onOpenChange, agent = null, options }: CustomAgentEditorDialogProps) {
  const t = useTranslations("settings.agents.custom.editor");
  const record = useCustomAgent(organizationId, agent?.id ?? null);
  const skills = useCustomSkills(organizationId);
  const failed = record.error ?? skills.error;
  const loading = skills.isPending || (agent !== null && record.isPending);
  const retry = (): void => {
    if (record.isError) void record.refetch();
    if (skills.isError) void skills.refetch();
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t(agent === null ? "createTitle" : "editTitle", { name: agent?.name ?? "" })}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      {failed !== null ? (
        <div className="flex flex-col items-start gap-3">
          <ApiErrorAlert error={failed} />
          <Button variant="outline" onClick={retry}>
            {t("retry")}
          </Button>
        </div>
      ) : loading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner decorative />
          {t("loading")}
        </p>
      ) : (
        <AgentForm organizationId={organizationId} agent={agent === null ? null : (record.data ?? null)} options={options} skills={skills.data ?? []} onClose={() => onOpenChange(false)} />
      )}
    </>
  );
}

/**
 * Creates or edits an agent of the organization (`POST /v1/agents`, `PATCH /v1/agents/{id}`,
 * core.agent-settings.update). Editing loads the whole record first (`GET /v1/agents/{id}`): the
 * catalog does not carry the instructions. The contract schema and the plan's cap give early
 * feedback; the API's `VALIDATION_FAILED` details land next to their fields. The body mounts on
 * open, so a draft never outlives the dialog.
 */
export function CustomAgentEditorDialog(props: CustomAgentEditorDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <AgentEditorBody key={props.agent?.id ?? "new"} {...props} />
      </DialogContent>
    </Dialog>
  );
}
