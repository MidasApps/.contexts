"use client";

import { startEvalExperimentEndpoint, type EvalDataset } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { useTenantAgentSettings } from "#/entities/agent-settings/index.ts";
import { tenantEvalKeys, useTenantDatasets } from "#/entities/eval-experiment/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldGroup, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { evaluableAgents, refusalProblems, validateExperimentDraft, type ExperimentDraft, type ExperimentDraftProblems } from "../model/experiment-draft.ts";

export type StartEvalExperimentDialogProps = {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type FieldsProps = { datasets: readonly EvalDataset[]; agents: readonly string[]; draft: ExperimentDraft; setDraft: (draft: ExperimentDraft) => void; problems: ExperimentDraftProblems };

function ExperimentFields({ datasets, agents, draft, setDraft, problems }: FieldsProps) {
  const t = useTranslations("settings.evals.start");
  return (
    <FieldGroup>
      <Field invalid={problems.dataset !== undefined}>
        <FieldLabel>{t("dataset")}</FieldLabel>
        <Select value={draft.datasetId} onValueChange={(datasetId) => setDraft({ ...draft, datasetId })}>
          <FieldControl>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
          </FieldControl>
          <SelectContent>
            {datasets.map((dataset) => (
              <SelectItem key={dataset.id} value={dataset.id}>
                {dataset.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError errors={[problems.dataset === undefined ? undefined : t(problems.dataset)]} />
      </Field>
      <Field invalid={problems.agent !== undefined}>
        <FieldLabel>{t("agent")}</FieldLabel>
        <Select value={draft.agentId} onValueChange={(agentId) => setDraft({ ...draft, agentId })}>
          <FieldControl>
            <SelectTrigger className="w-full font-mono">
              <SelectValue />
            </SelectTrigger>
          </FieldControl>
          <SelectContent>
            {agents.map((agent) => (
              <SelectItem key={agent} value={agent} className="font-mono">
                {agent}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>{t("agentHint")}</FieldDescription>
        <FieldError errors={[problems.agent === undefined ? undefined : t(problems.agent)]} />
      </Field>
    </FieldGroup>
  );
}

/** The form once datasets and agents are known; a dataset and the supervisor are preselected. */
function ExperimentForm({ organizationId, datasets, agents, onClose }: { organizationId: string; datasets: readonly EvalDataset[]; agents: readonly string[]; onClose: () => void }) {
  const t = useTranslations("settings.evals.start");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [draft, setDraft] = useState<ExperimentDraft>({ datasetId: datasets[0]?.id ?? "", agentId: agents[0] ?? "" });
  const [problems, setProblems] = useState<ExperimentDraftProblems>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const found = validateExperimentDraft(draft);
    setProblems(found);
    setFailure(null);
    if (Object.keys(found).length > 0) return;
    setPending(true);
    try {
      const { data } = await callEndpoint(startEvalExperimentEndpoint, { query: { organizationId }, body: draft });
      await queryClient.invalidateQueries({ queryKey: tenantEvalKeys.all(organizationId) });
      notify.success(t("done", { id: data.experimentId }));
      onClose();
    } catch (error: unknown) {
      const refused = refusalProblems(error);
      if (refused === null) setFailure(error);
      else setProblems(refused);
    } finally {
      setPending(false);
    }
  };

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      {online ? null : <OfflineNotice />}
      <ExperimentFields datasets={datasets} agents={agents} draft={draft} setDraft={setDraft} problems={problems} />
      {failure === null ? null : <ApiErrorAlert error={failure} />}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" pending={pending} disabled={!online}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DialogBody({ organizationId, onClose }: { organizationId: string; onClose: () => void }) {
  const t = useTranslations("settings.evals.start");
  const datasets = useTenantDatasets(organizationId);
  const settings = useTenantAgentSettings(organizationId);
  if (datasets.isPending || settings.isPending) return <LoadingState label={t("loading")} rows={2} />;
  if (datasets.isError) return <ApiErrorState frame="plain" headingLevel={3} error={datasets.error} onRetry={() => void datasets.refetch()} retrying={datasets.isFetching} />;
  if (datasets.data.length === 0) {
    return (
      <Alert>
        <AlertDescription>{t("noDatasets")}</AlertDescription>
      </Alert>
    );
  }
  // Without `core.agent-settings.read` the enabled subagents are unknown; the supervisor is always evaluable.
  return <ExperimentForm organizationId={organizationId} datasets={datasets.data} agents={evaluableAgents(settings.data)} onClose={onClose} />;
}

/**
 * Starts an experiment (`POST /v1/evals/experiments`, core.eval.write): one of the organization's
 * datasets and the supervisor or an enabled subagent. The run is the caller's and uses the
 * organization's budget. A disabled agent or a missing dataset is shown on its field.
 */
export function StartEvalExperimentDialog({ organizationId, open, onOpenChange }: StartEvalExperimentDialogProps) {
  const t = useTranslations("settings.evals.start");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {open ? <DialogBody organizationId={organizationId} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
