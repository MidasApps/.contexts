"use client";

import { addKnowledgeSourceEndpoint, type WorkflowRunStatus } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { knowledgeKeys } from "#/entities/knowledge/index.ts";
import { useTenantWorkflowRun } from "#/entities/workflow-run/index.ts";
import type { StartedKnowledgeIngestion } from "#/features/knowledge-upload/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";

/** Run outcomes that end an ingestion without a document (decision 0045 follow-up 60). */
const FAILED: ReadonlySet<WorkflowRunStatus> = new Set(["failed", "canceled", "tripwire"]);

export type IngestionNoticesProps = {
  readonly organizationId: string;
  /** Started runs whose document is not listed yet. */
  readonly runs: readonly StartedKnowledgeIngestion[];
  /** The viewer may read workflow runs (core.workflow-run.read); without it the run is not followed. */
  readonly followRuns: boolean;
  readonly onDismiss: (runId: string) => void;
  /** A run was started again: the old entry is replaced by the new one. */
  readonly onRestarted: (previousRunId: string, started: StartedKnowledgeIngestion) => void;
};

type NoticeProps = Omit<IngestionNoticesProps, "runs"> & { readonly run: StartedKnowledgeIngestion };

function FailedNotice({ organizationId, run, onDismiss, onRestarted }: Omit<NoticeProps, "followRuns">) {
  const t = useTranslations("settings.knowledge.indexing");
  const callEndpoint = useCallEndpoint();
  const [pending, setPending] = useState(false);
  const [retryError, setRetryError] = useState<unknown>(null);
  const titleId = `ingestion-failed-${run.runId}`;
  const retry = async (): Promise<void> => {
    setPending(true);
    setRetryError(null);
    try {
      const query = run.projectId === undefined ? {} : { projectId: run.projectId };
      const started = await callEndpoint(addKnowledgeSourceEndpoint, { params: { organizationId }, query, body: run.source });
      onRestarted(run.runId, { ...run, runId: started.data.runId });
    } catch (error: unknown) {
      setRetryError(error);
    } finally {
      setPending(false);
    }
  };
  return (
    <Alert variant="destructive" aria-labelledby={titleId}>
      <AlertTitle id={titleId}>{t("failedTitle", { name: run.label })}</AlertTitle>
      <AlertDescription className="text-inherit">
        <p>{t("failedDescription")}</p>
        <span className="block font-mono text-[11.5px]">{t("reference", { runId: run.runId })}</span>
        {retryError === null ? null : <ApiErrorAlert error={retryError} />}
        <span className="mt-2 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => void retry()} aria-label={t("retryNamed", { name: run.label })}>
            {t("retry")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDismiss(run.runId)} aria-label={t("dismissNamed", { name: run.label })}>
            {t("dismiss")}
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}

function IngestionNotice({ organizationId, run, followRuns, onDismiss, onRestarted }: NoticeProps) {
  const t = useTranslations("settings.knowledge.indexing");
  const queryClient = useQueryClient();
  // The hook re-reads every 2 s while the run can still change and stops on its own at the end.
  const followed = useTenantWorkflowRun(organizationId, run.runId, { enabled: followRuns });
  const status = followed.data?.status;
  const finished = status === "success";
  useEffect(() => {
    if (!finished) return;
    // The workflow registered the document: list it, then the notice has nothing left to say.
    void queryClient.invalidateQueries({ queryKey: knowledgeKeys.all(organizationId) }).then(() => onDismiss(run.runId));
  }, [finished, queryClient, organizationId, onDismiss, run.runId]);
  if (status !== undefined && FAILED.has(status)) return <FailedNotice organizationId={organizationId} run={run} onDismiss={onDismiss} onRestarted={onRestarted} />;
  if (finished) return null;
  return (
    <Alert variant="info" role="status">
      <AlertDescription className="flex w-full flex-wrap items-center justify-between gap-2 text-inherit">
        <span>{t("running", { name: run.label })}</span>
        <Button variant="outline" size="sm" onClick={() => onDismiss(run.runId)} aria-label={t("dismissNamed", { name: run.label })}>
          {t("dismiss")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * The ingestions started on this page whose document is not listed yet. Each one follows its
 * workflow run (`GET /v1/workflows/runs/{runId}`): a run that fails before registering a document
 * shows the failure with the run id as reference and can be started again or dismissed; a run that
 * succeeds refreshes the list and drops its notice. Without the run permission the notice stays
 * until the document appears or the user dismisses it.
 */
export function IngestionNotices({ runs, ...rest }: IngestionNoticesProps) {
  const t = useTranslations("settings.knowledge.indexing");
  if (runs.length === 0) return null;
  return (
    <ul aria-label={t("label")} className="flex flex-col gap-2">
      {runs.map((run) => (
        <li key={run.runId}>
          <IngestionNotice run={run} {...rest} />
        </li>
      ))}
    </ul>
  );
}
